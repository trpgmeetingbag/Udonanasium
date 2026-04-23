import { ChatMessage, ChatMessageContext } from './chat-message';
import { SyncObject, SyncVar } from './core/synchronize-object/decorator';
import { ObjectNode } from './core/synchronize-object/object-node';
import { InnerXml, ObjectSerializer } from './core/synchronize-object/object-serializer';
import { EventSystem } from './core/system';
import { Network } from './core/system';

@SyncObject('chat-tab')
export class ChatTab extends ObjectNode implements InnerXml {
  @SyncVar() name: string = 'タブ';

// ーーーここから追加（リリィ互換の立ち絵データ枠）ーーー
  @SyncVar() tachieDispFlag: boolean = true;
  @SyncVar() chatSimpleDispFlag: boolean = false;
  // XML保存時に枠が消滅するのを防ぐため、リリィに倣って半角スペースを初期値にします
  @SyncVar() imageIdentifier: string[] = [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '];

  tachiePosHide(pos: number) {
    if (pos >= 0 && pos < 12) {
      let newIdentifiers = this.imageIdentifier.slice();
      newIdentifiers[pos] = ' '; // 消す時も空文字ではなく半角スペースで上書きします
      this.imageIdentifier = newIdentifiers;
    }
  }
  // ーーー追加ここまでーーー

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
      EventSystem.trigger('MESSAGE_ADDED', { tabIdentifier: this.identifier, messageIdentifier: child.identifier });
    }
  }

  addMessage(message: ChatMessageContext): ChatMessage {
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
      chat.setAttribute(key, message[key]);
    }
    chat.initialize();
    EventSystem.trigger('SEND_MESSAGE', { tabIdentifier: this.identifier, messageIdentifier: chat.identifier });
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
  // === ↓ ここから追加（HTMLログ出力用メソッド） ↓ ===
// messageHtml メソッドの中身を以下に差し替え
  messageHtml( isTime: boolean , tabName: string, message: ChatMessage ): string{
    let str = '';
    if ( message ) {
      if ( tabName ) str += '[' + this.escapeHtml( tabName ) + ']';
      if ( isTime ){
        let date = new Date( message.timestamp );
        str += ( '00' + date.getHours() ).slice( -2 ) + ':' +  ( '00' + date.getMinutes()).slice( -2 ) + '：';
      }
      str += '<font color=\'';
      
      // 修正箇所: getAttribute を使用
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

  // messageHtmlCoc メソッドの中身も同様に修正
  messageHtmlCoc( tabName: string, message: ChatMessage ): string{
    let str = '';
    if ( message ) {
      // 修正箇所: getAttribute を使用
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
      let myId = Network.peer.userId; // 修正済
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
      let myId = Network.peer.userId; // 修正済
      if ( to && ( to != myId) && ( from != myId) ) continue;
      main += this.messageHtmlCoc( this.escapeHtml( this.name ) , mess );
    }
    return head + main + last;
  }
  // === ↑ ここまで追加 ↑ ===
}

