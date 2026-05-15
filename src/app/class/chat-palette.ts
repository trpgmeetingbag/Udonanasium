import { SyncObject, SyncVar } from './core/synchronize-object/decorator';
import { ObjectContext } from './core/synchronize-object/game-object';
import { ObjectNode } from './core/synchronize-object/object-node';
import { CompareOption, StringUtil } from './core/system/util/string-util';
import { DataElement } from './data-element';
import { GameCharacter } from './game-character';


export interface PaletteLine {
  palette: string;
}

export interface PaletteVariable {
  name: string;
  value: string;
}

export interface PaletteIndex {
  name: string;
  line: number;
}

@SyncObject('chat-palette')
export class ChatPalette extends ObjectNode {
  @SyncVar() dicebot: string = '';
  //TODO: キャラシ項目のコピー

  get paletteLines(): PaletteLine[] {
    if (!this.isAnalized) this.parse(<string>this.value);
    return this._paletteLines;
  }

  get paletteVariables(): PaletteVariable[] {
    if (!this.isAnalized) this.parse(<string>this.value);
    return this._paletteVariables;
  }

  private _palettes: string[] = [];
  private _paletteLines: PaletteLine[] = [];
  private _paletteVariables: PaletteVariable[] = [];
  private isAnalized: boolean = false;

  getPalette(): string[] {
    if (!this.isAnalized) this.parse(<string>this.value);
    return this._palettes;
  }

  setPalette(paletteSource: string) {
    this.value = paletteSource;
    this.isAnalized = false;
  }

  // evaluate(line: PaletteLine, extendVariables?: DataElement): string
  // evaluate(line: string, extendVariables?: DataElement): string
  // evaluate(line: any, extendVariables?: DataElement): string {
  //   let evaluate: string = '';
  //   if (typeof line === 'string') {
  //     evaluate = line;
  //   } else {
  //     evaluate = line.palette;
  //   }

  //   console.log(evaluate);
  //   let limit = 128;
  //   let loop = 0;
  //   let isContinue = true;
  //   while (isContinue) {
  //     loop++;
  //     isContinue = false;
  //     evaluate = evaluate.replace(/[{｛]\s*([^{}｛｝]+)\s*[}｝]/g, (match, name) => {
  //       name = StringUtil.toHalfWidth(name);
  //       console.log(name);
  //       isContinue = true;
  //       for (let variable of this.paletteVariables) {
  //         if (variable.name == name) return variable.value;
  //       }
  //       if (extendVariables) {
  //         let element = extendVariables.getFirstElementByName(name, CompareOption.IgnoreWidth);
  //         if (element) return element.isNumberResource ? element.currentValue + '' : element.value + '';
  //       }
  //       return '';
  //     });
  //     if (limit < loop) isContinue = false;
  //   }
  //   return evaluate;
  // }

  private parse(paletteSource: string) {
    this._palettes = paletteSource.split('\n');

    this._paletteLines = [];
    this._paletteVariables = [];

    for (let palette of this._palettes) {
      let variable = this.parseVariable(palette);
      if (variable) {
        this._paletteVariables.push(variable);
        continue;
      }
      let line: PaletteLine = { palette: palette };
      this._paletteLines.push(line);
    }
    this.isAnalized = true;
  }



  // override
  apply(context: ObjectContext) {
    super.apply(context);
    this.isAnalized = false;
  }

  // =========================================================
  // ▼▼ リリィ版互換：オートコンプリート用検索エンジン ▼▼
  // =========================================================

  paletteMatch(text: string): string[]{
    let count = 0;
    let matchList: string[] = [];

    let palettString = <string> this.value;
    let palettes = palettString.split('\n');

    for (let line of palettes ){
      if (line.indexOf(text) >= 0){
        matchList.push(line);
      }
      count++;
    }
    return matchList;
  }

  paletteMatchLine(text: string ,nth :number): number{
    let matchCount = 0;
    let lineNo = 0;
    let palettString = <string> this.value;
    let palettes = palettString.split('\n');

    for (let line of palettes ){
      if (line.indexOf(text) >= 0){
        if(matchCount == nth){
          return lineNo;
        }
        matchCount++;
      }
      lineNo++;
    }
    return -1;
  }

  
    private parseVariable(palette: string): PaletteVariable {
    let array = /^\s*[/／]{2}([^=＝{}｛｝\s]+)\s*[=＝]\s*(.+)\s*/gi.exec(palette);
    if (!array) return null;
    let variable: PaletteVariable = {
      name: StringUtil.toHalfWidth(array[1]),
      value: array[2]
    }
    return variable;
  }

  evaluate(line: PaletteLine, extendVariables?: DataElement): string
  evaluate(line: string, extendVariables?: DataElement,target?: GameCharacter): string
evaluate(line: any, extendVariables?: DataElement,target?: GameCharacter): string {
    let evaluate: string = '';
    
    console.log("[Debug evaluate] ============================");
    console.log("[Debug evaluate] evaluate開始");

    if (typeof line === 'string') {
      evaluate = line;
      console.log("[Debug evaluate] lineはstring型です。");
    } else {
      evaluate = line.palette;
      console.log("[Debug evaluate] lineはオブジェクト型です。");
    }

    console.log(`[Debug evaluate] 初期文字列: "${evaluate}"`);
    let limit = 128;
    let loop = 0;
    let isContinue = true;
    
    while (isContinue) {
      loop++;
      isContinue = false;
      console.log(`[Debug evaluate] --- Loop: ${loop}回目 --- 対象文字列: "${evaluate}"`);
      
      evaluate = evaluate.replace(/[tTｔＴ]?[{｛]\s*([^{}｛｝]+)\s*[}｝]/g, (match, name) => {
        console.log(`[Debug evaluate] ＞ 置換対象マッチ: match="${match}", 抽出name="${name}"`);

        name = StringUtil.toHalfWidth(name);
        let useMax = false;
        let namematch = name.match(/(.+)([\^＾]$)/);
        if (namematch) {
          name = namematch[1];
          useMax = true;
          console.log(`[Debug evaluate] ＞ 最大値(^)指定を検出。抽出name更新="${name}"`);
        } else {
          console.log(`[Debug evaluate] ＞ 半角変換後name="${name}" (最大値指定なし)`);
        }
        isContinue = true;

        if (match.match(/^[tTｔＴ].*/)) {
          console.log(`[Debug evaluate] ＞ ルート分岐: ターゲット(t)指定変数ルート`);
          
          if (!target) console.log(`[Debug evaluate] ＞ 警告: targetがundefinedです`);
          if (target && !target.chatPalette) console.log(`[Debug evaluate] ＞ 警告: target.chatPaletteがundefinedです`);

          for (let variable of target.chatPalette.paletteVariables) {
            if (variable.name == name) {
              let ret = variable.value.replace(/[{｛]/g,'t{');
              console.log(`[Debug evaluate] ＞＞ ターゲットパレットで発見: name="${variable.name}", value="${variable.value}" -> 変換後="${ret}"`);
              return ret;
            }
          }
          console.log(`[Debug evaluate] ＞＞ ターゲットパレットには存在せず。ステータスを検索します。`);
          
          if (target) {
            let element = target.rootDataElement.getFirstElementByName(name);
            if (element) {
              let targetElementText =''
              if (useMax && element.isNumberResource){
                targetElementText = element.value + '';
              }else{
                targetElementText = element.isNumberResource ? element.currentValue + '' : element.value + '';
              }
              console.log(`[Debug evaluate] ＞＞ ターゲットステータスで発見: elementValue="${targetElementText}"`);
              
              if ( targetElementText.match(/[{｛]\s*([^{}｛｝]+)\s*[}｝]/g)) {
                targetElementText = targetElementText.replace(/[{｛]/g,'t{');
                console.log(`[Debug evaluate] ＞＞ ステータス内変数をt指定に置換: -> "${targetElementText}"`);
              }
              return targetElementText;
            }
            console.log(`[Debug evaluate] ＞＞ ターゲットステータスにも存在しませんでした。`);
          }
        }else{
          console.log(`[Debug evaluate] ＞ ルート分岐: 自身変数ルート`);
          
          for (let variable of this.paletteVariables) {
            if (variable.name == name) {
              console.log(`[Debug evaluate] ＞＞ 自身パレットで発見: name="${variable.name}", 戻り値="${variable.value}"`);
              return variable.value;
            }
          }
          console.log(`[Debug evaluate] ＞＞ 自身パレットには存在せず。ステータスを検索します。`);

          if (extendVariables) {
            let element = extendVariables.getFirstElementByName(name);
            if (element) {
              let ret = '';
              if(useMax && element.isNumberResource) ret = element.value + '';
              else ret = element.isNumberResource ? element.currentValue + '' : element.value + '';
              console.log(`[Debug evaluate] ＞＞ 自身ステータスで発見: 戻り値="${ret}"`);
              return ret;
            }
            console.log(`[Debug evaluate] ＞＞ 自身ステータスにも存在しませんでした。`);
          } else {
             console.log(`[Debug evaluate] ＞＞ 警告: extendVariablesが指定されていないためステータス検索をスキップしました。`);
          }
        }
        console.log(`[Debug evaluate] ＞ 変数[${name}]はどこにも見つからなかったため、空文字に置換します`);
        return '';
      });
      
      console.log(`[Debug evaluate] --- Loop: ${loop}回目終了時の結果: "${evaluate}" ---`);
      if (limit < loop) {
        console.log(`[Debug evaluate] 制限回数(${limit}回)に到達したためループを強制終了します`);
        isContinue = false;
      }
    }

    console.log(`[Debug evaluate] evaluate完了。最終出力: "${evaluate}"`);
    console.log("[Debug evaluate] ============================");
    return evaluate;
  }

get paletteIndex(): PaletteIndex[]{
    let count = 0;
    let indexList: PaletteIndex[] = [];
    let palettString = <string> this.value;
    let palettes = palettString.split('\n');

    for (let line of palettes ){
      let ret = this.isPaletteIndex(line, count);
      if (ret) indexList.push(ret);
      count++;
    }
    return indexList;
  }

  isPaletteIndex( line: string , no: number): PaletteIndex{
    let index: PaletteIndex = { name: '', line: 0 };
    // 外部ツールの書式に完璧に対応
    let matchRes1 = line.match(/^\/\/--[-]+(.*)$/);
    let matchRes2 = line.match(/^◆(.*)$/);
    if (matchRes1){
      index.name = matchRes1[1].replace(/-+$/,'');
      index.line = no;
      return index;
    }
    if (matchRes2){
      index.name = matchRes2[1];
      index.line = no;
      return index;
    }
    return null;
  }
  
  
}

@SyncObject('dice-table-palette')
export class DiceTablePalette extends ChatPalette {
}

@SyncObject('buff-palette')
export class BuffPalette extends ChatPalette {
}



