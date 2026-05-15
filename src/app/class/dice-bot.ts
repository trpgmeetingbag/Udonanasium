import { GameSystemInfo } from 'bcdice/lib/bcdice/game_system_list.json';
import GameSystemClass from 'bcdice/lib/game_system';

import BCDiceLoader from './bcdice/bcdice-loader';
import { ChatMessage, ChatMessageContext } from './chat-message';
import { ChatTab } from './chat-tab';
import { SyncObject } from './core/synchronize-object/decorator';
import { GameObject } from './core/synchronize-object/game-object';
import { ObjectStore } from './core/synchronize-object/object-store';
import { EventSystem } from './core/system';
import { PromiseQueue } from './core/system/util/promise-queue';
import { StringUtil } from './core/system/util/string-util';
import { GameCharacter } from './game-character';

import { ChatMessageTargetContext } from './chat-message';
import { PeerCursor } from './peer-cursor';

// ▼▼▼ 追加：ダイス表を読み込むためのインポート ▼▼▼
import { DiceTable } from './dice-table';
import { DiceTablePalette } from './chat-palette';

// ▼▼▼ 新規追加：色情報を引き継ぐためのクラス ▼▼▼
import { DataElement } from './data-element';
// ▲▲▲ 新規追加ここまで ▲▲▲

interface ResourceEditOption {
  limitMinMax: boolean;
  zeroLimit: boolean;
  isErr: boolean;
}

interface ResourceEdit {
  target: string;
  operator: string;
  diceResult: string;
  command: string;
  replace: string;
  isDiceRoll: boolean;
  calcAns: number;
  nowOrMax: string;
  option: ResourceEditOption;
  object: GameCharacter;
  targeted: boolean;
}

interface BuffEdit {
  command: string;
  object : GameCharacter;
  targeted : boolean;
};

interface DiceRollResult {
  id: string;
  result: string;
  isSecret: boolean;
}

interface ResourceByCharacter{
  resourceCommand : string;
  object : GameCharacter;
}

interface BuffByCharacter{
  buffCommand : string;
  object : GameCharacter;
}



let loader: BCDiceLoader;
let queue: PromiseQueue = initializeDiceBotQueue();

@SyncObject('dice-bot')
export class DiceBot extends GameObject {
  static diceBotInfos: GameSystemInfo[] = [];

  // ▼▼▼ リリィ版互換：ステータス編集のシークレット判定 ▼▼▼
  checkSecretEditCommand(chatText: string): boolean {
    const text: string = ' ' + StringUtil.toHalfWidth(chatText).toLowerCase();
    const replaceText = text.replace('：', ':');
    let m = replaceText.match(/\sST?:/i);
    console.log(m);
    if( m ) return true;
    return false;
  }

  // 繰り返しコマンドを除去し、sより後ろがCOMMAND_PATTERNにマッチするか確認
// ▼▼▼ リリィ版互換：ダイスロールのシークレット判定 ▼▼▼
  checkSecretDiceCommand(gameSystem: any, chatText: string): boolean {
    console.log(`[Debug DB] --- checkSecretDiceCommand 処理開始 ---`);
    if (!gameSystem) {
      console.log(`[Debug DB] gameSystemがnullのため終了`);
      return false;
    }
    
    const text: string = StringUtil.toHalfWidth(chatText).toLowerCase();
    const nonRepeatText = text.replace(/^(\d+)?\s+/, 'repeat1 ').replace(/^x(\d+)?\s+/, 'repeat1 ').replace(/repeat(\d+)?\s+/, '');
    const regArray = /^s(.*)?/ig.exec(nonRepeatText);

    console.log(`[Debug DB] 元のテキスト: "${chatText}"`);
    console.log(`[Debug DB] リピート除去後: "${nonRepeatText}"`);
    console.log(`[Debug DB] ^s(.*) での抽出結果:`, regArray ? `"${regArray[1]}"` : 'マッチせず(null)');
    console.log(`[Debug DB] ターゲットシステムの COMMAND_PATTERN:`, gameSystem.COMMAND_PATTERN);

    if (gameSystem.COMMAND_PATTERN && regArray) {
      const isMatch = gameSystem.COMMAND_PATTERN.test(regArray[1]);
      console.log(`[Debug DB] COMMAND_PATTERN.test() の結果:`, isMatch);
      console.log(`[Debug DB] ---------------------------------------`);
      return isMatch;
    }
    
    console.log(`[Debug DB] COMMAND_PATTERNが存在しないか、Sから始まっていないため false`);
    console.log(`[Debug DB] ---------------------------------------`);
    return false;
  }

  // ▼▼▼ 同期的にゲームシステムを取得（これは前回追加したものでOKです） ▼▼▼

  // // ▼▼▼ シークレットダイス判定用メソッドを追加 ▼▼▼
  // checkSecretDiceCommand(gameType: string, chatText: string): boolean {
  //   const text: string = StringUtil.toHalfWidth(chatText).toLowerCase();
  //   // 繰り返しコマンド（x3 など）を除去して純粋なダイスコマンドを抽出
  //   const nonRepeatText = text.replace(/^(\d+)?\s+/, 'repeat1 ').replace(/^x(\d+)?\s+/, 'repeat1 ').replace(/repeat(\d+)?\s+/, '');
  //   const regArray = /^s(.*)?/ig.exec(nonRepeatText);
    
  //   if (!regArray) return false;

  //   // 同期的にゲームシステムを取得して判定
  //   const id = DiceBot.diceBotInfos.some(info => info.id === gameType) ? gameType : 'DiceBot';
  //   try {
  //     const gameSystem = loader.getGameSystemClass(id);
  //     if (gameSystem && gameSystem.COMMAND_PATTERN) {
  //       return gameSystem.COMMAND_PATTERN.test(regArray[1]);
  //     }
  //   } catch {
  //     return false;
  //   }
  //   return false;
  // }
  // ▲▲▲ 追加ここまで ▲▲▲
  // GameObject Lifecycle
  onStoreAdded() {
    super.onStoreAdded();
    EventSystem.register(this)
      .on('SEND_MESSAGE', async event => {
        let chatMessage = ObjectStore.instance.get<ChatMessage>(event.data.messageIdentifier);
        if (!chatMessage || !chatMessage.isSendFromSelf || chatMessage.isSystem) return;

        let text: string = StringUtil.toHalfWidth(chatMessage.text).trim();
        let gameType: string = chatMessage.tag ? chatMessage.tag.split(' ')[0] : '';

        try {
// --- START: ダイス表の割り込み判定 ---
          // チャットテキストの最初の単語（コマンド）を取得
          const splitText = text.split(/\s/);
          if (splitText.length > 0) {
            // 現在作成されているすべてのダイス表を取得
            const diceTables = ObjectStore.instance.getObjects(DiceTable);
            let targetTable: DiceTable = null;
            
            // 入力された単語と一致するコマンドを持つダイス表を探す
            for (const table of diceTables) {
              if (table.command === splitText[0]) {
                targetTable = table;
                break;
              }
            }

            // もしダイス表が見つかったら、標準ダイスボットを無視して表を振る
            if (targetTable) {
              const tableRegArray = /^((\d+)?\s+)?(.*)?/ig.exec(targetTable.dice);
              const tableRepeat: number = (tableRegArray[2] != null) ? Number(tableRegArray[2]) : 1;
              const tableRollText: string = (tableRegArray[3] != null) ? tableRegArray[3] : text;
              
              const finalResult: DiceRollResult = { id: targetTable.name, result: '', isSecret: false };
              
              // 振る回数（繰り返し）の処理
              for (let i = 0; i < tableRepeat && i < 32; i++) {
                // ダイス表に設定されているゲームシステムでダイスを振る
                const rollResult = await DiceBot.diceRollAsync(tableRollText, targetTable.diceTablePalette.dicebot);
                
                if (rollResult.result.length < 1) break;

                finalResult.result += rollResult.result;
                finalResult.isSecret = finalResult.isSecret || rollResult.isSecret;
                if (1 < tableRepeat) { finalResult.result += ` #${i + 1}`; }
              }

              // 振ったダイスの目（末尾の数字）を取得し、パレットから対応する文章を探す
              const rolledDiceNum = finalResult.result.match(/\d+$/);
              let tableAns = 'ダイス目の番号が表にありません';
              
              if (rolledDiceNum) {
                const tablePalette = targetTable.diceTablePalette.getPalette();
                for (const row of tablePalette) {
                  // 区切り文字（コロンやカンマなど）で分割して番号を確認
                  const splitRow = row.split(/[:：,，\s]/);
                  if (splitRow[0] === rolledDiceNum[0]) {
                    // \n を実際の改行に変換して結果文とする
                    tableAns = row.replace(/\\n/g, '\n');
                    break;
                  }
                }
              }
              
              // ダイス結果と表の結果を結合して送信
              finalResult.result += '\n' + tableAns;
              this.sendResultMessage(finalResult, chatMessage);
              
              // ここで処理を終了し、標準のダイスボットへ流さない
              return; 
            }
          }
          // --- END: ダイス表の割り込み判定 ---


          let regArray = /^((\d+)?\s+)?(.*)?/ig.exec(text);
          let repeat: number = (regArray[2] != null) ? Number(regArray[2]) : 1;
          let rollText: string = (regArray[3] != null) ? regArray[3] : text;
          if (!rollText || repeat < 1) return;
          // 繰り返しコマンドに変換
          if (repeat > 1) {
            rollText = `x${repeat} ${rollText}`
          }

          let rollResult = await DiceBot.diceRollAsync(rollText, gameType);
          if (!rollResult.result) return;
          this.sendResultMessage(rollResult, chatMessage);
        } catch (e) {
          console.error(e);
        }
        return;
      })
      .on('RESOURCE_EDIT_MESSAGE', async event => {
        const chatMessage = ObjectStore.instance.get<ChatMessage>(event.data.messageIdentifier);
        // 安全装置：自分以外の発信や、システムメッセージには反応しない
        if (!chatMessage || !chatMessage.isSendFromSelf || chatMessage.isSystem) { return; }

        const text: string = StringUtil.toHalfWidth(chatMessage.text);
        const gameType: string = chatMessage.tags ? chatMessage.tags[0] : '';
        
        console.log('リソース操作判定');
        // リリィ版のメソッドを呼び出す（三項演算子で安全に渡す）
        this.checkResourceEditCommand( chatMessage , event.data.messageTargetContext ? event.data.messageTargetContext : []);
        return;
      });

  }

  // GameObject Lifecycle
  onStoreRemoved() {
    super.onStoreRemoved();
    EventSystem.unregister(this);
  }

  private sendResultMessage(rollResult: DiceRollResult, originalMessage: ChatMessage) {
    let id: string = rollResult.id.split(':')[0];
    let result: string = rollResult.result;
    let isSecret: boolean = rollResult.isSecret;

    if (result.length < 1) return;

    let diceBotMessage: ChatMessageContext = {
      identifier: '',
      tabIdentifier: originalMessage.tabIdentifier,
      originFrom: originalMessage.from,
      from: 'System-BCDice',
      timestamp: originalMessage.timestamp + 1,
      imageIdentifier: '',
      tag: `system dicebot${isSecret ? ' secret' : ''}`,
      name: `${id} : ${originalMessage.name}${isSecret ? ' (Secret)' : ''}`,
      text: result
    };

    if (originalMessage.to != null && 0 < originalMessage.to.length) {
      diceBotMessage.to = originalMessage.to;
      if (originalMessage.to.indexOf(originalMessage.from) < 0) {
        diceBotMessage.to += ' ' + originalMessage.from;
      }
    }
    let chatTab = ObjectStore.instance.get<ChatTab>(originalMessage.tabIdentifier);
    // if (chatTab) chatTab.addMessage(diceBotMessage);
    // ▼▼▼ 修正：元の発言から色を取得し、ダイスボットの結果に引き継ぐ ▼▼▼
    if (chatTab) {
      let color = originalMessage.getAttribute('messColor');
      
      // 1. チャットタブに登録する前のデータ（Context）に色属性を持たせる
      if (color) {
        (diceBotMessage as any).messColor = color;
      }
      
      // メッセージをチャットタブに追加して生成
      let chat = chatTab.addMessage(diceBotMessage);
      
      // 2. 完全な互換性を保つため、生成されたメッセージの子要素としても色を追加する
      // if (chat && color) {
      //   let colorElement = DataElement.create('color', color, {});
      //   chat.appendChild(colorElement);
      // }
    }
    // ▲▲▲ 修正ここまで ▲▲▲
  }

  static async diceRollAsync(message: string, gameType: string): Promise<DiceRollResult> {
    const empty: DiceRollResult = { id: gameType, result: '', isSecret: false };
    try {
      const gameSystem = await DiceBot.loadGameSystemAsync(gameType);
      if (!gameSystem?.COMMAND_PATTERN.test(message)) return empty;

      const result = gameSystem.eval(message);
      if (result) {
        console.log('diceRoll!!!', result.text);
        console.log('isSecret!!!', result.secret);
        return {
          id: gameSystem.ID,
          result: result.text.replace(/\n?(#\d+)\n/ig, '$1 '), // 繰り返しダイスロールは改行表示を短縮する
          isSecret: result.secret,
        };
      }
    } catch (e) {
      console.error(e);
    }
    return empty;
  }

  static async getHelpMessage(gameType: string): Promise<string> {
    try {
      const gameSystem = await DiceBot.loadGameSystemAsync(gameType);
      return gameSystem.HELP_MESSAGE;
    } catch (e) {
      console.error(e);
    }
    return '';
  }

  static async loadGameSystemAsync(gameType: string): Promise<GameSystemClass> {
    return await queue.add(() => {
      const id = this.diceBotInfos.some(info => info.id === gameType) ? gameType : 'DiceBot';
      try {
        return loader.getGameSystemClass(id);
      } catch {
        return loader.dynamicLoad(id);
      }
    });
  }
  // ▼ 追記：ゲームシステムを同期的に取得するためのメソッド
  static getGameSystemSync(gameType: string): GameSystemClass | null {
    if (!loader) return null;
    const id = this.diceBotInfos.some(info => info.id === gameType) ? gameType : 'DiceBot';
    try {
      return loader.getGameSystemClass(id);
    } catch {
      return null;
    }
  }

// ▼▼▼ 追加：現在ターゲットされているキャラクターのリストを盤面からかき集める ▼▼▼
  private targetedGameCharacterList(): GameCharacter[] {
    return ObjectStore.instance.getObjects(GameCharacter).filter(character => character.targeted);
  }
  // ▲▲▲ 追加ここまで ▲▲▲

  private checkResourceEditCommand( originalMessage: ChatMessage , messageTargetContext: any[]){

    let resourceByCharacter :ResourceByCharacter[] = [];
    let buffByCharacter :BuffByCharacter[] = [];

    // 送信元キャラクターの取得
    let sendFromObject :GameCharacter = this.messageSendGameCharacter(originalMessage.sendFrom, originalMessage);
    let isSecret = false;

    let targetContexts = messageTargetContext;
    if (!targetContexts || targetContexts.length === 0) {
      targetContexts = [{ text: originalMessage.text, object: null }];
    }

    for (const oneMessageTargetContext of targetContexts) {
      let text = ' ' + oneMessageTargetContext.text;
      let isMatch = text.match(/(\s[sSｓＳ][tTｔＴ]?[:：&＆])/i) ? true : false;
      if(isMatch){
        isSecret = true;
      }

      let text2 = text.replace(/(\s[sSｓＳ][tTｔＴ][:：])/i, ' t:');
      let text3 = text2.replace(/(\s[sSｓＳ][:：])/i, ' :');
      let text4 = text3.replace(/([tTｔＴ][:：])/gi, 't:');
      let text5 = text4.replace(/([tTｔＴ][&＆])/gi, 't&');
      let text6 = text5.replace(/([:：])/gi, ':');
      let text7 = text6.replace(/([&＆])/gi, '&');

      let splitText = text7.split(/\s/);

      for (const chktxt of splitText) {
        if ( chktxt.match(/^(t?[:&][^:：&＆])+/gi)){
          //正常。処理無し
        }else{
          continue;
        }

        let resultRes = chktxt.match(/t?:[^:：&＆]+/gi);
        let resultBuff = chktxt.match(/t?&[^:：&＆]+/gi);

        // ▼▼▼ 修正：ターゲット操作(t:)なのに相手が未指定の場合、自分でターゲットを探して展開する ▼▼▼
        if ( resultRes ){
          for( let res of resultRes){
            let isTargeted = res.match(/^t:/i);
            if (isTargeted && !oneMessageTargetContext.object) {
              // ターゲット操作の時：盤面のターゲット全員にコマンドを複製する
              let targets = this.targetedGameCharacterList();
              for (let target of targets) {
                resourceByCharacter.push({ resourceCommand: res, object: target });
              }
            } else {
              // 自分自身の操作の時
              resourceByCharacter.push({ resourceCommand: res, object: oneMessageTargetContext.object });
            }
          }
        }
        
        if ( resultBuff ){
          for( let buff of resultBuff){
            let isTargeted = buff.match(/^t&/i);
            if (isTargeted && !oneMessageTargetContext.object) {
              // バフ付与（ターゲット）の時
              let targets = this.targetedGameCharacterList();
              for (let target of targets) {
                buffByCharacter.push({ buffCommand: buff, object: target });
              }
            } else {
              // バフ付与（自分）の時
              buffByCharacter.push({ buffCommand: buff, object: oneMessageTargetContext.object });
            }
          }
        }
        // ▲▲▲ 修正ここまで ▲▲▲
      }
    }
    
    // 集計したコマンドリストを実行プロセスへ引き渡す
    this.resourceEditProcess(sendFromObject, resourceByCharacter , buffByCharacter, originalMessage , isSecret);
  }

  resourceEditParseOption( text: string): ResourceEditOption{

    let ans: ResourceEditOption = {
      limitMinMax: false,
      zeroLimit: false,
      isErr: false
    };
    const mat = StringUtil.toHalfWidth(text).match(/([A-CE-Z]+)$/i);
    if (!mat) return ans;
    let option = mat[1];

    if (option.match(/L/i)){
      option = option.replace(/L/i, '');
      ans.limitMinMax = true;
    }

    if (option.match(/Z/i)){
      option = option.replace(/Z/i, '');
      ans.zeroLimit = true;
    }else{
      ans.zeroLimit = false;
    }

    if (option.length != 0){
      ans.isErr = true;
    }
    return ans;
  }

  private resourceCommandToEdit(oneResourceEdit: ResourceEdit, text: string, object: GameCharacter, targeted: boolean): boolean{
    console.log('リソース変更コマンド処理開始');
//    console.log(object.name);
    oneResourceEdit.object = object;
    oneResourceEdit.targeted = targeted;
    const replaceText = ' ' + text.replace('：', ':').replace('＋', '+').replace('－', '-').replace('＝', '=').replace('＞', '>');

    console.log('リソース変更：' + replaceText);
    const resourceEditRegExp = /[:]([^-+=>]+)([-+=>])(.*)/;
    const resourceEditResult = replaceText.match(resourceEditRegExp);
    if (resourceEditResult[2] != '>' && resourceEditResult[3] == '') { return false;}

    let chkNowOrMaxString: string = resourceEditResult[1];
    let reg1: string;
    let reg1HalfWidth: string;

    let namematch = chkNowOrMaxString.match(/(.+)([\^＾]$)/);
    let nowOrMax = '';
    if (namematch) {
      reg1 = namematch[1];
      reg1HalfWidth = StringUtil.toHalfWidth(reg1);
      oneResourceEdit.nowOrMax = 'max';
    }else{
      reg1 = resourceEditResult[1];
      reg1HalfWidth = StringUtil.toHalfWidth(reg1);
      oneResourceEdit.nowOrMax = 'now';
    }

    const reg2: string = resourceEditResult[2];
    oneResourceEdit.operator = reg2;                            // 演算符号

    if (object.chkChangeStatusName(reg1)){
      oneResourceEdit.target = reg1;                             // 操作対象検索文字タイプ生値
    }else if (object.chkChangeStatusName(reg1HalfWidth)){
      oneResourceEdit.target = reg1HalfWidth;                    // 操作対象検索文字半角化
    }else{
      return false; // 対象なし実行失敗
    }

    if ( oneResourceEdit.operator == '>' ){
      oneResourceEdit.replace = resourceEditResult[3];
    }else{
      let reg3: string = resourceEditResult[3].replace(/[A-CE-ZＡ-ＣＥ-Ｚ]+$/i, '');
      const commandPrefix = oneResourceEdit.operator == '-' ? '-' : '';
      oneResourceEdit.command = commandPrefix + StringUtil.toHalfWidth(reg3) + '+(1d1-1)';
      // 操作量C()とダイスロールが必要な場合分けをしないために+(1d1-1)を付加してダイスロール命令にしている

      console.log( reg1 + '/' + reg2 + '/' + reg3 );
      reg3 = reg3.replace(/[A-CE-ZＡ-ＣＥ-Ｚ]+$/i, '');

      const optionCommand = this.resourceEditParseOption(resourceEditResult[3]);
      if (optionCommand.isErr){
        return false; // 実行失敗
      }
      oneResourceEdit.option = optionCommand;

      if (StringUtil.toHalfWidth(reg3).match(/\d[dD]/)) {
        oneResourceEdit.isDiceRoll = true;
      } else {
        oneResourceEdit.isDiceRoll = false;
      }
    }
    return true;
  }

  defaultResourceEdit(): ResourceEdit{
    let oneResourceEdit: ResourceEdit = {
      target: '',
      operator: '',
      diceResult: '',
      command: '',
      replace: '',
      isDiceRoll: false,
      calcAns: 0,
      nowOrMax: 'now',
      option : null,
      object : null,
      targeted : false
    };
    return oneResourceEdit;
  }


async resourceEditProcess(sendFromObject , resourceByCharacter: ResourceByCharacter[], buffByCharacter: BuffByCharacter[], originalMessage: ChatMessage, isSecret: Boolean){

    console.log('[Debug DB] === resourceEditProcess 処理開始 ===');
    console.log(`[Debug DB] resourceByCharacter件数: ${resourceByCharacter.length}, buffByCharacter件数: ${buffByCharacter.length}`);

    const allEditList: ResourceEdit[] = [];
    console.log('[Debug DB] loadGameSystemAsync 実行前');
    const gameSystem = await DiceBot.loadGameSystemAsync(originalMessage.tags ? originalMessage.tags[0] : '');
    console.log('[Debug DB] loadGameSystemAsync 実行完了');

    let targetObjects: GameCharacter[] = [];
    console.log('resourceEditProcess');
    
    for ( const res of resourceByCharacter ){
      let oneText = res.resourceCommand;
      console.log(`[Debug DB] --- リソース処理対象コマンド: "${oneText}" ---`);
      
      let targeted = oneText.match(/^t:/i) ? true :false;
      console.log(`[Debug DB] targeted判定: ${targeted}`);
      
      let obj :GameCharacter;
      if (targeted) {
        console.log(`[Debug DB] 【Targeted(他者)ルート】へ分岐`);
        let object = res.object;
        let oneResourceEdit: ResourceEdit = this.defaultResourceEdit();
        
        console.log(`[Debug DB] resourceCommandToEdit 実行前`);
        let parseResult = this.resourceCommandToEdit(oneResourceEdit, oneText, object, targeted);
        console.log(`[Debug DB] resourceCommandToEdit 実行結果: ${parseResult}`);
        if ( !parseResult ) {
          console.log(`[Debug DB] ⚠ resourceCommandToEditがfalseを返したため、ここでreturnします(処理中断)`);
          return;
        }

        console.log(`[Debug DB] operator値: "${oneResourceEdit.operator}"`);
        if (oneResourceEdit.operator != '>') {
          // ダイスロール及び四則演算
          try {
            console.log(`[Debug DB] BCDiceへ送信(Targeted): command="${oneResourceEdit.command}"`);
            const rollResult = await DiceBot.diceRollAsync(oneResourceEdit.command, originalMessage.tags ? originalMessage.tags[0] : '');
            console.log(`[Debug DB] BCDiceからの返答(Targeted):`, rollResult);

            if (!rollResult.result) { 
              console.log(`[Debug DB] ⚠ BCDiceのresultが空のため、ここでreturn nullします(処理中断)`);
              return null; 
            }
            const splitResult = rollResult.result.split(' ＞ ');
            oneResourceEdit.diceResult = splitResult[splitResult.length - 2].replace(/\+\(1\[1\]\-1\)$/, '');
            const resultMatch = rollResult.result.match(/([-+]?\d+)$/); // 計算結果だけ格納
            oneResourceEdit.calcAns = parseInt(resultMatch[1], 10);
            console.log(`[Debug DB] 計算完了(Targeted): calcAns=${oneResourceEdit.calcAns}, diceResult="${oneResourceEdit.diceResult}"`);
          } catch (e) {
            console.error(e);
          }
        }
        allEditList.push( oneResourceEdit);
        console.log(`[Debug DB] allEditListにプッシュしました(Targeted)`);
        
      }else{
        console.log(`[Debug DB] 【Self(自身)ルート】へ分岐`);
        if( sendFromObject == null) {
          obj = null;
          console.log('キャラクターでないリソースは操作できません');
          console.log(`[Debug DB] ⚠ sendFromObjectがnullのため、ここでreturnします(処理中断)`);
          return;
        }else{
          obj = sendFromObject;
          console.log(`[Debug DB] 操作対象キャラクター: ${obj.name}`);
          let oneResourceEdit: ResourceEdit = this.defaultResourceEdit();
          
          console.log(`[Debug DB] resourceCommandToEdit 実行前`);
          let parseResult = this.resourceCommandToEdit(oneResourceEdit, oneText, obj, targeted);
          console.log(`[Debug DB] resourceCommandToEdit 実行結果: ${parseResult}`);
          if ( !parseResult ) {
            console.log(`[Debug DB] ⚠ resourceCommandToEditがfalseを返したため、ここでreturnします(処理中断)`);
            return;
          }

          console.log(`[Debug DB] operator値: "${oneResourceEdit.operator}"`);
          if (oneResourceEdit.operator != '>') {
            // ダイスロール及び四則演算
            try {
              console.log(`[Debug DB] BCDiceへ送信(Self): command="${oneResourceEdit.command}"`);
              const rollResult = await DiceBot.diceRollAsync(oneResourceEdit.command, originalMessage.tags ? originalMessage.tags[0] : '');
              console.log(`[Debug DB] BCDiceからの返答(Self):`, rollResult);

              if (!rollResult.result) { 
                console.log(`[Debug DB] ⚠ BCDiceのresultが空のため、ここでreturn nullします(処理中断)`);
                return null; 
              }
              const splitResult = rollResult.result.split(' ＞ ');
              oneResourceEdit.diceResult = splitResult[splitResult.length - 2].replace(/\+\(1\[1\]\-1\)$/, '');
              const resultMatch = rollResult.result.match(/([-+]?\d+)$/); // 計算結果だけ格納
              oneResourceEdit.calcAns = parseInt(resultMatch[1], 10);
              console.log(`[Debug DB] 計算完了(Self): calcAns=${oneResourceEdit.calcAns}, diceResult="${oneResourceEdit.diceResult}"`);
            } catch (e) {
              console.error(e);
            }
          }
          allEditList.push( oneResourceEdit);
          console.log(`[Debug DB] allEditListにプッシュしました(Self)`);
        }
      }
    }

    console.log(`[Debug DB] --- リソース処理ループ終了。バフ(Buff)処理ループへ移行 ---`);
    let repBuffCommandList: BuffEdit[] = [];
    for ( const buff of buffByCharacter ){
      let oneText = buff.buffCommand;
      console.log(`[Debug DB] --- バフ処理対象コマンド: "${oneText}" ---`);
      let targeted = oneText.match(/^t&/i) ? true :false;
      let obj :GameCharacter;
      if (targeted) {
        console.log(`[Debug DB] バフ【Targeted】ルート`);
        let object = buff.object;
        const replaceText = oneText.replace('＆', '&').replace(/＋$/, '+').replace(/－$/, '-');
        let oneBuffEdit: BuffEdit = {
          command: replaceText,
          object : object,
          targeted : targeted
        };
        repBuffCommandList.push(oneBuffEdit);
      }else{
        console.log(`[Debug DB] バフ【Self】ルート`);
        if( sendFromObject == null) {
          obj = null;
          console.log('キャラクターでないものに対してバフ操作はできません');
          console.log(`[Debug DB] ⚠ バフ処理: sendFromObjectがnullのためreturnします`);
          return;
        }else{
          const replaceText = oneText.replace('＆', '&').replace(/＋$/, '+').replace(/－$/, '-');
          let oneBuffEdit: BuffEdit = {
            command: replaceText,
            object : sendFromObject,
            targeted : targeted
          };
          repBuffCommandList.push(oneBuffEdit);
        }
      }
    }

    console.log(`[Debug DB] === resourceBuffEdit を呼び出します ===`);
    this.resourceBuffEdit( allEditList , repBuffCommandList, originalMessage, isSecret);
    console.log(`[Debug DB] === resourceEditProcess 処理終了 ===`);
    return;
  }

  private resourceTextEdit(edit: ResourceEdit, character: GameCharacter): string{
    character.setStatusText(edit.target, edit.replace);
    let ansText = edit.target + '＞' + edit.replace + '    ';
    return ansText;
  }

  private resourceEdit(edit: ResourceEdit, character: GameCharacter): string{
    let optionText = '';
    let oldNum = 0;
    let newNum = 0;
    let maxNum = null;
    let nowOrMax = edit.nowOrMax;

    maxNum = character.getStatusValue(edit.target, 'max');
    if(nowOrMax == 'max' && maxNum == null) {
      nowOrMax = 'now';
    }
    if(nowOrMax == 'now') {
      oldNum = character.getStatusValue(edit.target, 'now');
    }else{
      oldNum = character.getStatusValue(edit.target, 'max');
    }

    if (edit.operator == '=') {
      newNum = edit.calcAns;
    } else {
      const flag = edit.option.zeroLimit;
      if (flag && edit.operator == '+' && (edit.calcAns < 0)) {
        newNum = oldNum + 0;
        optionText = '(0制限)';
      }else if (flag && edit.operator == '-' && (edit.calcAns > 0)) {
        newNum = oldNum + 0;
        optionText = '(0制限)';
      }else{
        newNum = oldNum + edit.calcAns;
      }
    }

    if (edit.option.limitMinMax && maxNum != null){
      if (newNum > maxNum && nowOrMax == 'now'){
        newNum = maxNum;
        optionText = '(最大)';
      }
      if (newNum < 0 ){
        newNum = 0;
        optionText = '(最小)';
      }
    }

    if(nowOrMax == 'now') {
      character.setStatusValue(edit.target, 'now', newNum);
    }else{
      character.setStatusValue(edit.target, 'max', newNum);
    }

    const operatorText = edit.operator == '-' ? '' : edit.operator;
    const changeMax = nowOrMax == 'max' ? '(最大値)' : '';
    const ansText = edit.target + changeMax + ':' + oldNum + operatorText + edit.diceResult + '＞' + newNum + optionText + '    ';
    return ansText;
  }

  private buffEdit(buff: BuffEdit, character: GameCharacter): string{
    let command = buff.command;
    let text = '';
    if (buff.targeted) {
      text += '[' + character.name + '] ';
    }
    if ( command.match(/^[tTｔＴ]?&[RＲrｒ]-$/i) ){
      character.decreaseBuffRound();
      text += 'バフRを減少';
      text += '    ';
    }else if ( command.match(/^[tTｔＴ]?&[RＲrｒ][+]$/i) ){
      character.increaseBuffRound();
      text += 'バフRを増加';
      text += '    ';
    }else if ( command.match(/^[tTｔＴ]?&[DＤdｄ]$/i) ){
      character.deleteZeroRoundBuff();
      text += '0R以下のバフを消去';
      text += '    ';
    }else if ( command.match(/^[tTｔＴ]?&.+-$/i) ){
      let match = command.match(/^[tTｔＴ]?&(.+)-$/i);
      console.log('match' + match);
      const reg1 = match[1];
      if (character.deleteBuff(reg1) ){
        text += reg1 + 'を消去';
        text += '    ';
      }
    }else{
      const splittext = command.replace(/^[tTｔＴ]?&/i, '').split('/');
      let round = null;
      let sub = '';
      let buffname = '';
      let bufftext = '';
      buffname = splittext[0];
      bufftext = splittext[0];
      if ( splittext.length > 1){ sub = splittext[1]; bufftext = bufftext + '/' + splittext[1]; }
      if ( splittext.length > 2){ 
        if( splittext[2] ){
          round = parseInt(splittext[2]);
          if( Number.isNaN(round)){
            round = 3;
          }
        }else{
          round = 3;
        }bufftext = bufftext + '/' + round + 'R';
      }

      character.addBuffRound(buffname, sub, round);
      text += 'バフを付与 ' + bufftext;
      text += '    ';
    }
    return text;
  }

  private resourceBuffEdit( allEditList: ResourceEdit[] , buffList: BuffEdit[], originalMessage: ChatMessage , isSecret: Boolean){
    let isTarget: Boolean = false;
    let text = '';
// リソース処理
    let isDiceRoll = false;
    let character: GameCharacter;
    for ( let edit of allEditList) {
      character = edit.object;
      if ( edit.targeted) {
        text += '['+ character.name +'] ';
      }
      if (edit.operator == '>'){
        text += this.resourceTextEdit(edit, character);
      }else{
        text += this.resourceEdit(edit, character);
      }
      if ( edit.isDiceRoll ) { isDiceRoll = true; }
    }
// バフ処理
    for ( let buff of buffList) {
      character = buff.object;
      text += this.buffEdit(buff, character);
    }
    text = text.replace(/\s\s\s\s$/, '');

    if ( text == '')return;
    let fromText;
    let nameText;
    if ( isDiceRoll ){
      fromText = 'System-BCDice';
      nameText = '<BCDice：' + originalMessage.name + '>';
    }else{
      fromText = 'System';
      nameText = originalMessage.name;
    }
const resourceMessage: ChatMessageContext = {
      identifier: '',
      tabIdentifier: originalMessage.tabIdentifier,
      originFrom: originalMessage.from,
      from: fromText,
      timestamp: originalMessage.timestamp + 2,
      imageIdentifier: '', // ◀ 空文字（アイコンなし）に修正
      tag: isSecret ? 'system secret': 'system',
      name: nameText,
      text,
      messColor: originalMessage.messColor
    };
    const chatTab = ObjectStore.instance.get<ChatTab>(originalMessage.tabIdentifier);
    if (chatTab) { chatTab.addMessage(resourceMessage); }
  }

  
  // 【修正後：Vanilla環境向けの賢い検索機能を追加】
private messageSendGameCharacter(sendFrom: string, originalMessage?: ChatMessage): GameCharacter {
    // 1. リリィ版の本来の仕様（IDで直接引く）
    if (sendFrom) {
      let object = ObjectStore.instance.get(sendFrom);
      if (object instanceof GameCharacter) return object;
    }

    // 2. Vanilla環境向けの検索（名前を優先）
    if (originalMessage) {
      const characters = ObjectStore.instance.getObjects(GameCharacter);
      // メッセージの送信者名と、キャラクター名が一致するものを探す
      // ※前後の空白などを考慮して trim() を入れています
      const match = characters.find(c => c.name.trim() === originalMessage.name.trim());
      
      if (match) {
        console.log(`[Debug] キャラクター特定成功: ${match.name} (ID: ${match.identifier})`);
        return match;
      }
    }

    console.log('キャラクタからの発信じゃありません');
    return null;
  }


}



function initializeDiceBotQueue(): PromiseQueue {
  let queue = new PromiseQueue('DiceBotQueue');
  queue.add(async () => {
    loader = new (await import(
      /* webpackChunkName: "lib/bcdice/bcdice-loader" */
      './bcdice/bcdice-loader')
    ).default;
    DiceBot.diceBotInfos = loader.listAvailableGameSystems()
      .sort((a, b) => {
        if (a.sortKey < b.sortKey) return -1;
        if (a.sortKey > b.sortKey) return 1;
        return 0;
      });
  });
  return queue;
}
