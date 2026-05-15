import { ChatMessage, ChatMessageContext } from './chat-message';
import { SyncObject, SyncVar } from './core/synchronize-object/decorator';
import { ObjectNode } from './core/synchronize-object/object-node';
import { InnerXml, ObjectSerializer } from './core/synchronize-object/object-serializer';
import { EventSystem } from './core/system';
import { Network } from './core/system';

@SyncObject('chat-tab')
export class ChatTab extends ObjectNode implements InnerXml {
  @SyncVar() name: string = 'タブ';

  // === 既存の成功済統合機能（チャット簡易表示の個別化など）を保護 ===
  @SyncVar() tachieDispFlag: boolean = true;
  @SyncVar() chatSimpleDispFlag: boolean = false;

  // === ↓ ここからリリィ版 立ち絵データ管理ロジック（完全再現） ↓ ===
  @SyncVar() pos_num = -1;
  @SyncVar() imageIdentifier: string[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
  @SyncVar() imageCharactorName: string[] = ['#0', '#1', '#2', '#3', '#4', '#5', '#6', '#7', '#8', '#9', '#10', '#11'];
  @SyncVar() imageIdentifierZpos: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  @SyncVar() count = 0;
  @SyncVar() imageIdentifierDummy = 'test'; // 通信開始ために使わなくても書かなきゃだめっぽいロジックをそのまま継承

  imageDispFlag: boolean[] = [true, true, true, true, true, true, true, true, true, true, true, true];

  tachieReset() {
    this.imageIdentifier = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
    this.imageCharactorName = ['#0', '#1', '#2', '#3', '#4', '#5', '#6', '#7', '#8', '#9', '#10', '#11'];
    this.imageIdentifierZpos = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    this.imageIdentifierDummy = 'test';
  }

  get imageZposList(): number[] {
    let ret: number[] = this.imageIdentifierZpos.slice();
    return ret;
  }

  getImageCharactorPos(name: string) {
    for (let i = 0; i < this.imageCharactorName.length; i++) {
      if (name == this.imageCharactorName[i]) {
        return i;
      }
    }
    return -1;
  }

  tachiePosHide(pos: number) {
    this.imageDispFlag[pos] = false;
  }

  tachiePosIsDisp(pos: number): boolean {
    return this.imageDispFlag[pos];
  }

  tachieZindex(toppos: number): number {
    let index = this.imageIdentifierZpos.indexOf(Number(toppos));
    return index;
  }

  replaceTachieZindex(toppos: number) {
    let index = this.imageIdentifierZpos.indexOf(Number(toppos));
    if (index >= 0) {
      this.imageIdentifierZpos.splice(index, 1);
      this.imageIdentifierZpos.push(Number(toppos));
    }
  }
  // === ↑ リリィ版ロジック ここまで ↑ ===

  get chatMessages(): ChatMessage[] { return <ChatMessage[]>this.children; }

  private _unreadLength: number = 0;
  get unreadLength(): number { return this._unreadLength; }
  get hasUnread(): boolean { return 0 < this.unreadLength; }

  get latestTimeStamp(): number {
    let lastIndex = this.chatMessages.length - 1;
    return lastIndex < 0 ? 0 : this.chatMessages[lastIndex].timestamp;
  }

  // ObjectNode Lifecycle
  onChildAdded(child: ObjectNode) {
    super.onChildAdded(child);
    if (child.parent === this && child instanceof ChatMessage && child.isDisplayable) {
      this._unreadLength++;

      // リリィ版: マウスクリック非表示からの復帰ロジック
      let to = child.getAttribute('to');
      if (to != null && to !== '') {
        // 秘話時に立ち絵の更新をかけない(処理なし)
      } else {
        let imagePosStr = child.getAttribute('imagePos');
        if (imagePosStr != null && imagePosStr !== '') {
          this.imageDispFlag[Number(imagePosStr)] = true;
        }
      }

      EventSystem.trigger('MESSAGE_ADDED', { tabIdentifier: this.identifier, messageIdentifier: child.identifier });
    }
  }

// src/app/class/chat-tab.ts

  // 引数に messageTargetContext を追加し、ターゲット指定を受け取れるようにします
  addMessage(message: ChatMessageContext, messageTargetContext?: any): ChatMessage {
    message.tabIdentifier = this.identifier;

    let chat = new ChatMessage();
    for (let key in message) {
      if (key === 'identifier') continue;
      if (key === 'tabIdentifier') continue;

      if (key === 'text') {
        chat.value = message[key];
        continue;
      }
      if (message[key] == null || message[key] === '') continue;

      // リリィ版: 立ち絵のPOS計算およびZ-Index更新ロジック
      if (key === 'imagePos') {
        if (message.to != null && message.to !== '') { continue; } // 秘話時に立ち絵の更新をかけない
        this.pos_num = message[key];
        if (0 <= this.pos_num && this.pos_num < this.imageIdentifier.length) {
          let oldpos = this.getImageCharactorPos(message.name);
          if (oldpos >= 0) { // 同名キャラの古い位置を消去
            this.imageIdentifier[oldpos] = '';
            this.imageCharactorName[oldpos] = '';
            this.imageDispFlag[oldpos] = false;
          }

          if (message.imageIdentifier == '') {
            // 事前に古い立ち絵は消す処理をしているため処理なし
          } else {
            this.imageIdentifier[this.pos_num] = message.imageIdentifier;
            this.imageCharactorName[this.pos_num] = message.name;
            this.replaceTachieZindex(this.pos_num);
            this.imageDispFlag[this.pos_num] = true;

            chat.setAttribute(key, message[key]);
          }
          this.imageIdentifierDummy = message.imageIdentifier; // 同期強制のためのダミー更新
        }
        continue;
      }

      chat.setAttribute(key, message[key]);
    }
    chat.initialize();
    
    // 通常のチャット送信イベント
    EventSystem.trigger('SEND_MESSAGE', { tabIdentifier: this.identifier, messageIdentifier: chat.identifier });

    // ▼▼ 追加：リリィ準拠 リソース変更イベントの発火 ▼▼
    // 第2引数の messageTargetContext も一緒に送ることで、ターゲット指定のリソース操作に対応させます
    EventSystem.trigger('RESOURCE_EDIT_MESSAGE', { 
      tabIdentifier: this.identifier, 
      messageIdentifier: chat.identifier, 
      messageTargetContext: messageTargetContext ? messageTargetContext : null
    });
    // ▲▲ 追加ここまで ▲▲

    this.appendChild(chat);
    return chat;
  }

  markForRead() {
    this._unreadLength = 0;
  }

  innerXml(): string {
    let xml = '';
    for (let child of this.children) {
      if (child instanceof ChatMessage && !child.isDisplayable) continue;
      xml += ObjectSerializer.instance.toXml(child);
    }
    return xml;
  };

  parseInnerXml(element: Element) {
    return super.parseInnerXml(element);
  };

  // === ↓ 既存のHTMLログ出力用メソッド（維持） ↓ ===
  messageHtml( isTime: boolean , tabName: string, message: ChatMessage ): string{
    let str = '';
    if ( message ) {
      if ( tabName ) str += '[' + this.escapeHtml( tabName ) + ']';
      if ( isTime ){
        let date = new Date( message.timestamp );
        str += ( '00' + date.getHours() ).slice( -2 ) + ':' +  ( '00' + date.getMinutes()).slice( -2 ) + '：';
      }
      str += '<font color=\'';
      
      let messColor = message.getAttribute('messColor'); 
      if ( messColor ) str += messColor.toLowerCase();
      
      str += '\'>';
      str += '<b>';
      if ( message.name ) str += this.escapeHtml( message.name );
      str += '</b>';
      str += '：';
      if ( !message.isSecret || message.isSendFromSelf ){
        if ( message.text ) str += this.escapeHtml( message.text ).replace(/\n/g, '<br>');
      }else{
        str += '（シークレットダイス）';
      }
      str += '</font><br>\n';
    }
    return str;
  }

  messageHtmlCoc( tabName: string, message: ChatMessage ): string{
    let str = '';
    if ( message ) {
      let messColor = message.getAttribute('messColor');
      str += "    <p style=\"color:" + (messColor ? messColor.toLowerCase() : '#000000') +";\">\n";
      str += "      <span> [" + tabName + "]</span>\n";
      str += "      <span>" + this.escapeHtml( message.name ).replace('<', '').replace('>', '') + "</span>\n";
      str += "      <span>\n        ";
      if ( !message.isSecret || message.isSendFromSelf ){
        if ( message.text ) str += this.escapeHtml( message.text ).replace(/\n/g, '<br>').replace(/→/g, '＞');
      }else{
        str += '（シークレットダイス）';
      }
      str += "\n      </span>\n    </p>\n    \n";
    }
    return str;
  }

  escapeHtml(string) {
    if (typeof string !== 'string') return string;
    let escapeText = string.replace(/[&'`"<>]/g, function(match){
      return { '&': '&amp;', '\'': '&#x27;', '`': '&#x60;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[match];
    });
    return escapeText.replace(/[\|｜]([^\|｜\s]+?)《(.+?)》/g, '<ruby>$1<rt>$2</rt></ruby>').replace(/\\s/g,' ');
  }

  logHtml(): string {
    let head = "<?xml version='1.0' encoding='UTF-8'?>\n<!DOCTYPE html PUBLIC '-//W3C//DTD XHTML 1.0 Transitional//EN' 'http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd'>\n<html xmlns='http://www.w3.org/1999/xhtml' lang='ja'>\n  <head>\n    <meta http-equiv='Content-Type' content='text/html; charset=UTF-8' />\n    <title>チャットログ：" + this.escapeHtml(this.name) + "</title>\n  </head>\n  <body>\n";
    let last = "\n  </body>\n</html>";
    let main = "";

    for (let mess of this.chatMessages ) {
      let to = mess.to;
      let from = mess.from;
      let myId = Network.peer.userId;
      if ( to && ( to != myId) && ( from != myId) ) continue;
      main += this.messageHtml( true , '' , mess );
    }
    return head + main + last;
  }

  logHtmlCoc(): string {
    let head = "<!DOCTYPE html>\n<html lang=\"ja\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <meta http-equiv=\"X-UA-Compatible\" content=\"ie=edge\" />\n    <title>udonaliumlily - logs</title>\n  </head>\n  <body>\n   \n";
    let last = "  </body>\n</html>";
    let main = "";

    for (let mess of this.chatMessages ) {
      let to = mess.to;
      let from = mess.from;
      let myId = Network.peer.userId;
      if ( to && ( to != myId) && ( from != myId) ) continue;
      main += this.messageHtmlCoc( this.escapeHtml( this.name ) , mess );
    }
    return head + main + last;
  }
}