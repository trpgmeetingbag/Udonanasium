import { ChatMessage, ChatMessageContext } from './chat-message';
import { SyncObject, SyncVar } from './core/synchronize-object/decorator';
import { ObjectNode } from './core/synchronize-object/object-node';
import { InnerXml, ObjectSerializer } from './core/synchronize-object/object-serializer';
import { EventSystem } from './core/system';

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
}