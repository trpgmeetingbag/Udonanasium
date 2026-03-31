import { Injectable } from '@angular/core';

import { ChatMessage, ChatMessageContext } from '@udonarium/chat-message';
import { ChatTab } from '@udonarium/chat-tab';
import { ChatTabList } from '@udonarium/chat-tab-list';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';
import { Network } from '@udonarium/core/system';
import { GameCharacter } from '@udonarium/game-character';
import { PeerCursor } from '@udonarium/peer-cursor';

const HOURS = 60 * 60 * 1000;

@Injectable()
export class ChatMessageService {
  private intervalTimer: NodeJS.Timeout = null;
  private timeOffset: number = Date.now();
  private performanceOffset: number = performance.now();

  private ntpApiUrls: string[] = [
    'https://worldtimeapi.org/api/ip',
  ];

  gameType: string = '';

  constructor() { }

  get chatTabs(): ChatTab[] {
    return ChatTabList.instance.chatTabs;
  }

  calibrateTimeOffset() {
    if (this.intervalTimer != null) {
      console.log('calibrateTimeOffset was canceled.');
      return;
    }
    let index = Math.floor(Math.random() * this.ntpApiUrls.length);
    let ntpApiUrl = this.ntpApiUrls[index];
    let sendTime = performance.now();
    fetch(ntpApiUrl)
      .then(response => {
        if (response.ok) return response.json();
        throw new Error('Network response was not ok.');
      })
      .then(jsonObj => {
        let endTime = performance.now();
        let latency = (endTime - sendTime) / 2;
        let timeobj = jsonObj;
        let st: number = new Date(timeobj.utc_datetime).getTime();
        let fixedTime = st + latency;
        this.timeOffset = fixedTime;
        this.performanceOffset = endTime;
        console.log('latency: ' + latency + 'ms');
        console.log('st: ' + st + '');
        console.log('timeOffset: ' + this.timeOffset);
        console.log('performanceOffset: ' + this.performanceOffset);
        this.setIntervalTimer();
      })
      .catch(error => {
        console.warn('There has been a problem with your fetch operation: ', error.message);
        this.setIntervalTimer();
      });
    this.setIntervalTimer();
  }

  private setIntervalTimer() {
    if (this.intervalTimer != null) clearTimeout(this.intervalTimer);
    this.intervalTimer = setTimeout(() => {
      this.intervalTimer = null;
      this.calibrateTimeOffset();
    }, 6 * HOURS);
  }

  getTime(): number {
    return Math.floor(this.timeOffset + (performance.now() - this.performanceOffset));
  }


  // ーーーまるごと書き換えーーー
sendMessage(chatTab: ChatTab, text: string, gameType: string, sendFrom: string, sendTo?: string, color: string = '#000000', tachieId: string = ''): ChatMessage {
    let chatMessage: ChatMessageContext = {
      from: Network.peer.userId,
      to: this.findId(sendTo),
      name: this.makeMessageName(sendFrom, sendTo),
      imageIdentifier: tachieId || this.findImageIdentifier(sendFrom), // 送られてきた立ち絵IDを適用
      timestamp: this.calcTimeStamp(chatTab),
      tag: gameType,
      text: text,
    };

    let message = chatTab.addMessage(chatMessage);
    if (message) {
      message.setAttribute('messColor', color);
      message.setAttribute('sendFrom', sendFrom);
      // POSは後のフェーズでキャラクターデータから直接読み取るため、ここでは一旦0固定で保存します
      //message.setAttribute('imagePos', '0');

      // ーーーここから追加（立ち絵の表示更新ロジック）ーーー
      let charObj = ObjectStore.instance.get(sendFrom);
      if (charObj instanceof GameCharacter) {
        let pos = 0;
        
// --- START: スライダーの選択（tachieId）を最優先で反映する処理 ---
        // 1. POSの取得（シートの tachie -> tachiePosition から取得）
        let tachieRoot = charObj.detailDataElement ? charObj.detailDataElement.getFirstElementByName('tachie') : null;
        if (tachieRoot) {
          let posElement = tachieRoot.getFirstElementByName('tachiePosition');
          if (posElement) {
            pos = parseInt(posElement.value.toString(), 10);
          }
        }
        if (isNaN(pos)) pos = 0;

        // 2. 画像IDの取得（チャット入力欄のスライダーから渡された tachieId を最優先）
        let imageIdentifier = tachieId;
        
        // スライダーからの指定がない場合は、現在のコマ画像を使用
        if (!imageIdentifier) {
          let imageElement = charObj.imageDataElement ? charObj.imageDataElement.getFirstElementByName('imageIdentifier') : null;
          if (imageElement) {
             imageIdentifier = imageElement.value ? imageElement.value.toString() : '';
          } else if (charObj.imageFile) {
             imageIdentifier = charObj.imageFile.identifier;
          }
        }
// --- END ---

        // 3. ChatTabの立ち絵スロットを上書き更新
        if (imageIdentifier && pos >= 0 && pos < 12) {
          // 古いセーブデータ対策（配列が存在しない場合は初期化）
          if (!chatTab.imageIdentifier) {
            chatTab.imageIdentifier = [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '];
          }
          // 配列を新しく作り直してセットすることで、ユドナリウムの同期システムに変更を検知させます
          let newIdentifiers = chatTab.imageIdentifier.slice();
          newIdentifiers[pos] = imageIdentifier;
          chatTab.imageIdentifier = newIdentifiers; 
        }
      }
      // ーーー追加ここまでーーー

    }
    return message;
  }
  //古いコード
  // sendMessage(chatTab: ChatTab, text: string, gameType: string, sendFrom: string, sendTo?: string, color: string = '#000000', pos: number = 0): ChatMessage {
  //   let chatMessage: ChatMessageContext = {
  //     from: Network.peer.userId,
  //     to: this.findId(sendTo),
  //     name: this.makeMessageName(sendFrom, sendTo),
  //     imageIdentifier: this.findImageIdentifier(sendFrom),
  //     timestamp: this.calcTimeStamp(chatTab),
  //     tag: gameType,
  //     text: text,
  //   };

  //   // 一旦メッセージを作成
  //   let message = chatTab.addMessage(chatMessage);
    
  //   // 生成されたメッセージオブジェクトに、カスタム属性（XMLの要素）として色やPOSを書き込む
  //   if (message) {
  //     message.setAttribute('messColor', color);
  //     message.setAttribute('imagePos', pos.toString());
  //     message.setAttribute('sendFrom', sendFrom);
  //   }

  //   return message;
  // }
  // ーーーまるごと書き換えここまでーーー
  // sendMessage(chatTab: ChatTab, text: string, gameType: string, sendFrom: string, sendTo?: string): ChatMessage {
  //   let chatMessage: ChatMessageContext = {
  //     from: Network.peer.userId,
  //     to: this.findId(sendTo),
  //     name: this.makeMessageName(sendFrom, sendTo),
  //     imageIdentifier: this.findImageIdentifier(sendFrom),
  //     timestamp: this.calcTimeStamp(chatTab),
  //     tag: gameType,
  //     text: text,
  //   };

  //   return chatTab.addMessage(chatMessage);
  // }

  private findId(identifier: string): string {
    let object = ObjectStore.instance.get(identifier);
    if (object instanceof GameCharacter) {
      return object.identifier;
    } else if (object instanceof PeerCursor) {
      return object.userId;
    }
    return null;
  }

  private findObjectName(identifier: string): string {
    let object = ObjectStore.instance.get(identifier);
    if (object instanceof GameCharacter) {
      return object.name;
    } else if (object instanceof PeerCursor) {
      return object.name;
    }
    return identifier;
  }

  private makeMessageName(sendFrom: string, sendTo?: string): string {
    let sendFromName = this.findObjectName(sendFrom);
    if (sendTo == null || sendTo.length < 1) return sendFromName;

    let sendToName = this.findObjectName(sendTo);
    return sendFromName + ' > ' + sendToName;
  }

  private findImageIdentifier(identifier: string): string {
    let object = ObjectStore.instance.get(identifier);
    if (object instanceof GameCharacter) {
      return object.imageFile ? object.imageFile.identifier : '';
    } else if (object instanceof PeerCursor) {
      return object.imageIdentifier;
    }
    return identifier;
  }

  private calcTimeStamp(chatTab: ChatTab): number {
    let now = this.getTime();
    let latest = chatTab.latestTimeStamp;
    return now <= latest ? latest + 1 : now;
  }
}
