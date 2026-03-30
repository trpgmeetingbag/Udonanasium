import { ImageFile } from './core/file-storage/image-file';
import { ImageStorage } from './core/file-storage/image-storage';
import { SyncObject, SyncVar } from './core/synchronize-object/decorator';
import { ObjectNode } from './core/synchronize-object/object-node';
import { Network } from './core/system';

export interface ChatMessageContext {
  identifier?: string;
  tabIdentifier?: string;
  originFrom?: string;
  from?: string;
  to?: string;
  name?: string;
  text?: string;
  timestamp?: number;
  tag?: string;
  dicebot?: string;
  imageIdentifier?: string;
}

@SyncObject('chat')
export class ChatMessage extends ObjectNode implements ChatMessageContext {
  @SyncVar() originFrom: string;
  @SyncVar() from: string;
  @SyncVar() to: string;
  @SyncVar() name: string;
  @SyncVar() tag: string;
  @SyncVar() dicebot: string;
  @SyncVar() imageIdentifier: string;

  get tabIdentifier(): string { return this.parent.identifier; }
  get text(): string { return <string>this.value }
  get timestamp(): number {
    let timestamp = this.getAttribute('timestamp');
    let num = timestamp ? +timestamp : 0;
    return Number.isNaN(num) ? 1 : num;
  }

// --- 立ち絵・色拡張用のゲッターとセッター（理想のXML構造に合わせた修正版） ---
  
  // テキスト色 (XML属性: messColor)
  get color(): string { return this.getAttribute('messColor'); }
  set color(color: string) { this.setAttribute('messColor', color); }

  // 立ち絵の表示位置 (XML属性: imagePos)
  get tachiePos(): number {
    const pos = this.getAttribute('imagePos');
    return pos ? Number(pos) : 0; 
  }
  set tachiePos(tachiePos: number) { this.setAttribute('imagePos', tachiePos.toString()); }
  
  // 送信元キャラクターの識別子 (XML属性: sendFrom)
  get sendFromChar(): string { return this.getAttribute('sendFrom'); }
  set sendFromChar(sendFrom: string) { this.setAttribute('sendFrom', sendFrom); }

  // 立ち絵の画像ID (XML属性: imageIdentifier は既存の仕組みに既に存在するため、ここではヘルパーのみ記述します)
  get imageUrl(): string {
    const id = this.imageIdentifier; // 既存の imageIdentifier プロパティを使用
    if (!id) return '';
    const file = ImageStorage.instance.get(id);
    return file ? file.url : '';
  }

  // ----------------- ↑ここまで追加分↑ -------------------

  private _to: string;
  private _sendTo: string[] = [];
  get sendTo(): string[] {
    if (this._to !== this.to) {
      this._to = this.to;
      this._sendTo = this.to != null && 0 < this.to.trim().length ? this.to.trim().split(/\s+/) : [];
    }
    return this._sendTo;
  }
  private _tag: string;
  private _tags: string[] = [];
  get tags(): string[] {
    if (this._tag !== this.tag) {
      this._tag = this.tag;
      this._tags = this.tag != null && 0 < this.tag.trim().length ? this.tag.trim().split(/\s+/) : [];
    }
    return this._tags;
  }
  get image(): ImageFile { return ImageStorage.instance.get(this.imageIdentifier); }
  get index(): number { return this.minorIndex + this.timestamp; }
  get isDirect(): boolean { return 0 < this.sendTo.length ? true : false; }
  get isSendFromSelf(): boolean { return this.from === Network.peer.userId || this.originFrom === Network.peer.userId; }
  get isRelatedToMe(): boolean { return (-1 < this.sendTo.indexOf(Network.peer.userId)) || this.isSendFromSelf ? true : false; }
  get isDisplayable(): boolean { return this.isDirect ? this.isRelatedToMe : true; }
  get isSystem(): boolean { return -1 < this.tags.indexOf('system') ? true : false; }
  get isDicebot(): boolean { return this.isSystem && this.from === 'System-BCDice' ? true : false; }
  get isSecret(): boolean { return -1 < this.tags.indexOf('secret') ? true : false; }
}
