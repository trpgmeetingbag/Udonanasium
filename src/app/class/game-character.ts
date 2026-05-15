import { ChatPalette } from './chat-palette';
import { SyncObject, SyncVar } from './core/synchronize-object/decorator';
import { DataElement } from './data-element';
import { TabletopObject } from './tabletop-object';
import { ObjectStore } from './core/synchronize-object/object-store';

@SyncObject('character')
export class GameCharacter extends TabletopObject {
  @SyncVar() rotate: number = 0;
  @SyncVar() roll: number = 0;
  @SyncVar() specifyKomaImageFlag: boolean = false; // コマ画像のサイズ指定フラグ
  @SyncVar() komaImageHeignt: number = 100;        // 指定されたコマ画像の高さ
  // 【追加】リリィ互換のチャットカラー保存用プロパティ（0番目のみ）
// 修正：ドットを含む属性は、ユドナリウムの仕様上「入れ子オブジェクト」として定義します

  @SyncVar() isLock: boolean = false; // コマの固定フラグ
  @SyncVar() isDropShadow: boolean = false; // 影の表示フラグ

    @SyncVar() overViewWidth: number = 270;
  @SyncVar() overViewMaxHeight: number = 250;
  @SyncVar() hideInventory: boolean = false; // 【追加】インベントリ非表示フラグ
  @SyncVar() nonTalkFlag: boolean = false;    // 【追加】発言しないフラグ
  @SyncVar() syncDummyCounter: number = 0;

    @SyncVar() chatColorCode: string[] = ["#000000", "#FF0000", "#0099FF"];
      // @SyncVar() chatColorCode: { '0': string, '1': string, '2': string } = { '0': '', '1': '', '2': '' };

 
  

  get name(): string { return this.getCommonValue('name', ''); }
  get size(): number { return this.getCommonValue('size', 1); }

  
  // ▼▼▼ 追加：セッターを定義して外部からの書き換えを許可する ▼▼▼
  set name(value: string) { this.setCommonValue('name', value); }

  get chatPalette(): ChatPalette {
    for (let child of this.children) {
      if (child instanceof ChatPalette) return child;
    }
    return null;
  }

  // ▼▼▼ リリィ互換：複製時に名前の末尾に連番（_2, _3...）を自動付与する ▼▼▼
  clone(): this {
    let cloneObject = super.clone();

    let objectname: string;
    let reg = new RegExp('^(.*)_([0-9]+)$');
    let res = cloneObject.name.match(reg);

    let cloneNumber: number = 0;
    // 既に「名前_数値」の形式なら、その数値をベースにする
    if (res != null && res.length == 3) {
      objectname = res[1];
      cloneNumber = parseInt(res[2]) + 1;
    } else {
      objectname = cloneObject.name;
      cloneNumber = 2; // 初回複製時は _2 からスタート
    }

    // 盤面全体のキャラクターを取得して、最も大きい連番を探す
    let list = ObjectStore.instance.getObjects(GameCharacter);
    for (let character of list) {
      // 墓場（削除済み）にあるコマは連番のカウントから除外する
      if (character.location.name == 'graveyard') continue;

      res = character.name.match(reg);
      if (res != null && res.length == 3 && res[1] == objectname) {
        let numberChk = parseInt(res[2]) + 1;
        if (cloneNumber <= numberChk) {
          cloneNumber = numberChk;
        }
      }
    }

    // 新しい名前をセットして同期
    cloneObject.name = objectname + '_' + cloneNumber;
    cloneObject.update();

    return cloneObject;
  }
  // ▲▲▲ 追加ここまで ▲▲▲

  static create(name: string, size: number, imageIdentifier: string): GameCharacter {
    let gameCharacter: GameCharacter = new GameCharacter();
    gameCharacter.createDataElements();
    gameCharacter.initialize();
    gameCharacter.createTestGameDataElement(name, size, imageIdentifier);

    return gameCharacter;
  }

  createTestGameDataElement(name: string, size: number, imageIdentifier: string) {
    this.createDataElements();

    let nameElement: DataElement = DataElement.create('name', name, {}, 'name_' + this.identifier);
    let sizeElement: DataElement = DataElement.create('size', size, {}, 'size_' + this.identifier);

    if (this.imageDataElement.getFirstElementByName('imageIdentifier')) {
      this.imageDataElement.getFirstElementByName('imageIdentifier').value = imageIdentifier;
    }

    let resourceElement: DataElement = DataElement.create('リソース', '', {}, 'リソース' + this.identifier);
    let hpElement: DataElement = DataElement.create('HP', 200, { 'type': 'numberResource', 'currentValue': '200' }, 'HP_' + this.identifier);
    let mpElement: DataElement = DataElement.create('MP', 100, { 'type': 'numberResource', 'currentValue': '100' }, 'MP_' + this.identifier);

    this.commonDataElement.appendChild(nameElement);
    this.commonDataElement.appendChild(sizeElement);

    this.detailDataElement.appendChild(resourceElement);
    resourceElement.appendChild(hpElement);
    resourceElement.appendChild(mpElement);

    //TEST
    let testElement: DataElement = DataElement.create('情報', '', {}, '情報' + this.identifier);
    this.detailDataElement.appendChild(testElement);
    testElement.appendChild(DataElement.create('説明', 'ここに説明を書く\nあいうえお', { 'type': 'note' }, '説明' + this.identifier));
    testElement.appendChild(DataElement.create('メモ', '任意の文字列\n１\n２\n３\n４\n５', { 'type': 'note' }, 'メモ' + this.identifier));

    //TEST
    testElement = DataElement.create('能力', '', {}, '能力' + this.identifier);
    this.detailDataElement.appendChild(testElement);
    testElement.appendChild(DataElement.create('器用度', 24, {}, '器用度' + this.identifier));
    testElement.appendChild(DataElement.create('敏捷度', 24, {}, '敏捷度' + this.identifier));
    testElement.appendChild(DataElement.create('筋力', 24, {}, '筋力' + this.identifier));
    testElement.appendChild(DataElement.create('生命力', 24, {}, '生命力' + this.identifier));
    testElement.appendChild(DataElement.create('知力', 24, {}, '知力' + this.identifier));
    testElement.appendChild(DataElement.create('精神力', 24, {}, '精神力' + this.identifier));

    //TEST
    testElement = DataElement.create('戦闘特技', '', {}, '戦闘特技' + this.identifier);
    this.detailDataElement.appendChild(testElement);
    testElement.appendChild(DataElement.create('Lv1', '全力攻撃', {}, 'Lv1' + this.identifier));
    testElement.appendChild(DataElement.create('Lv3', '武器習熟/ソード', {}, 'Lv3' + this.identifier));
    testElement.appendChild(DataElement.create('Lv5', '武器習熟/ソードⅡ', {}, 'Lv5' + this.identifier));
    testElement.appendChild(DataElement.create('Lv7', '頑強', {}, 'Lv7' + this.identifier));
    testElement.appendChild(DataElement.create('Lv9', '薙ぎ払い', {}, 'Lv9' + this.identifier));
    testElement.appendChild(DataElement.create('自動', '治癒適正', {}, '自動' + this.identifier));

// --- START: リリィ互換の初期データ（立ち絵位置とコマ画像）を追加 ---
// --- START: 初期化時にPOSの最大値を11に設定する ---
    let tachiePosElement = DataElement.create('立ち絵位置', '', {}, '立ち絵位置' + this.identifier);
    this.detailDataElement.appendChild(tachiePosElement);
    // 第2引数の value を 0 から 11（最大値）へ変更
    tachiePosElement.appendChild(DataElement.create('POS', 11, { 'type': 'numberResource', 'currentValue': '0' }, 'POS_' + this.identifier));

    let komaImageElement = DataElement.create('コマ画像', '', {}, 'コマ画像' + this.identifier);
    this.detailDataElement.appendChild(komaImageElement);
    komaImageElement.appendChild(DataElement.create('ICON', 0, { 'type': 'numberResource', 'currentValue': '0' }, 'ICON_' + this.identifier));
// --- END ---

    let domParser: DOMParser = new DOMParser();
    let gameCharacterXMLDocument: Document = domParser.parseFromString(this.rootDataElement.toXml(), 'application/xml');

    let palette: ChatPalette = new ChatPalette('ChatPalette_' + this.identifier);
    palette.setPalette(`チャットパレット入力例：
2d6+1 ダイスロール
１ｄ２０＋{敏捷}＋｛格闘｝　{name}の格闘！
//敏捷=10+{敏捷A}
//敏捷A=10
//格闘＝１`);
    palette.initialize();
    this.appendChild(palette);
  }

// =========================================================
  // ▼▼ リリィ版互換：ステータス操作 ＆ ダミーバフ管理メソッド ▼▼
  // =========================================================

  chkChangeStatusName(name: string): boolean {
    return !!(this.detailDataElement?.getFirstElementByName(name) || this.commonDataElement?.getFirstElementByName(name));
  }

  getStatusType(name: string, nowOrMax: string): string {
    const data = this.detailDataElement?.getFirstElementByName(name) || this.commonDataElement?.getFirstElementByName(name);
    if (!data) return null;
    if (nowOrMax === 'max') return 'value';
    if (nowOrMax === 'now') return (data.type === 'numberResource' || data.currentValue !== undefined) ? 'currentValue' : 'value';
    return null;
  }

  getStatusValue(name: string, nowOrMax: string): number {
    const data = this.detailDataElement?.getFirstElementByName(name) || this.commonDataElement?.getFirstElementByName(name);
    if (!data) return null;
    let type = this.getStatusType(name, nowOrMax);
    if (type === 'value') return Number(data.value);
    if (type === 'currentValue') return Number(data.currentValue);
    return null;
  }

  setStatusValue(name: string, nowOrMax: string, value: number): boolean {
    const data = this.detailDataElement?.getFirstElementByName(name) || this.commonDataElement?.getFirstElementByName(name);
    if (!data) return false;
    let type = this.getStatusType(name, nowOrMax);
    if (type === 'value') data.value = value;
    if (type === 'currentValue') data.currentValue = value;
    return true;
  }

  setStatusText(name: string, text: string): boolean {
    const data = this.detailDataElement?.getFirstElementByName(name) || this.commonDataElement?.getFirstElementByName(name);
    if (!data) return false;
    if (data.type === 'numberResource' || data.currentValue !== undefined) {
      data.currentValue = text;
    } else {
      data.value = text;
    }
    return true;
  }

  // --- バフ管理システム（エラー回避用のダミー実装） ---
  decreaseBuffRound() { /* ダミー処理 */ }
  increaseBuffRound() { /* ダミー処理 */ }
  deleteZeroRoundBuff() { /* ダミー処理 */ }
  deleteBuff(name: string): boolean { return false; /* ダミー処理 */ }
  addBuffRound(name: string, sub: string, round: number) { /* ダミー処理 */ }
  

  // ▲▲ 追加ここまで ▲▲
  
  // game-character.ts にエラーが出た場合のみ追加

  get rootDataElement(): DataElement {
    return this.children.find(c => c.aliasName === 'data' || c instanceof DataElement) as DataElement;
  }
}
