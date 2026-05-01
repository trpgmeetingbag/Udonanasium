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

// ▼▼▼ 追加：ダイス表を読み込むためのインポート ▼▼▼
import { DiceTable } from './dice-table';
import { DiceTablePalette } from './chat-palette';

// ▼▼▼ 新規追加：色情報を引き継ぐためのクラス ▼▼▼
import { DataElement } from './data-element';
// ▲▲▲ 新規追加ここまで ▲▲▲

interface DiceRollResult {
  id: string;
  result: string;
  isSecret: boolean;
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
