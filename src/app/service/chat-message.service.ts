import { Injectable, NgZone } from '@angular/core';
import GameSystemClass from 'bcdice/lib/game_system';
import { EventSystem } from '@udonarium/core/system';

import { ChatMessage, ChatMessageContext } from '@udonarium/chat-message';
import { ChatTab } from '@udonarium/chat-tab';
import { ChatTabList } from '@udonarium/chat-tab-list';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';
import { Network } from '@udonarium/core/system';
import { GameCharacter } from '@udonarium/game-character';
import { PeerCursor } from '@udonarium/peer-cursor';
import { ImageStorage } from '@udonarium/core/file-storage/image-storage';
import { DataElement } from '@udonarium/data-element';
import { DiceBot } from '@udonarium/dice-bot';

import { PresetSound, SoundEffect } from '@udonarium/sound-effect';
import { AudioPlayer } from '@udonarium/core/file-storage/audio-player';

const HOURS = 60 * 60 * 1000;

@Injectable()
export class ChatMessageService {
  private intervalTimer: NodeJS.Timeout = null;
  private timeOffset: number = Date.now();
  private performanceOffset: number = performance.now();

  private ntpApiUrls: string[] = [
    'https://worldtimeapi.org/api/ip',
  ];

  gameType: string = 'DiceBot';

  private notifiedPeers: Set<string> = new Set();
  private disconnectTimers: Map<string, NodeJS.Timeout[]> = new Map();

  constructor(private ngZone: NgZone) {
    this.initializeSystemNotice();

    const customChime = new Audio('./assets/sounds/nc96723.mp3');
    customChime.volume = 0.5;

    let pendingChimeTimer: any = null;

    const soundObserver = {};
    EventSystem.register(soundObserver)
      .on('MESSAGE_ADDED', event => {
        let msg = ObjectStore.instance.get<ChatMessage>(event.data.messageIdentifier);
        if (!msg) return;
        if (msg.timestamp < this.getTime() - 3000) return;

        if (msg.isDicebot) {
           if (pendingChimeTimer) {
              clearTimeout(pendingChimeTimer);
              pendingChimeTimer = null;
           }
           return;
        }

        let text = String(msg.value || msg.text || '');
        const isMacroCommand = /^:[^\s:+\-*/=^]+\^?[+\-*/=]/.test(text);
        const isMacroResult = /^[^\s:+\-*/=^]+(?:\(最大値\))?:.*＞/.test(text);

        if (msg.tag === 'system' && msg.from === 'System') {
           if (isMacroResult) {
              if (/\[.*\]/.test(text)) {
                 SoundEffect.play(PresetSound.diceRoll1); 
              } else {
                 customChime.volume = AudioPlayer.volume;
                 customChime.currentTime = 0;
                 customChime.play().catch(e => {}); 
              }
           }
        }
        else if (msg.tag !== 'system' && msg.from !== 'System' && text.length > 0) {
           if (!isMacroCommand) {
              if (pendingChimeTimer) {
                 clearTimeout(pendingChimeTimer);
              }
              pendingChimeTimer = setTimeout(() => {
                 customChime.volume = AudioPlayer.volume;
                 customChime.currentTime = 0; 
                 customChime.play().catch(e => {}); 
                 pendingChimeTimer = null;
              }, 50); 
           }
        }
      });
  }

  private initializeSystemNotice() {
    EventSystem.register(this)
      .on('CONNECT_PEER', event => {
        const peerId = event.data.peerId;

        if (this.disconnectTimers.has(peerId)) {
          const timers = this.disconnectTimers.get(peerId);
          timers.forEach(t => clearTimeout(t));
          this.disconnectTimers.delete(peerId);
          return; 
        }

        if (this.notifiedPeers.has(peerId)) return;
        this.notifiedPeers.add(peerId);

        this.ngZone.run(() => {
          setTimeout(() => {
            const peerCursor = PeerCursor.findByPeerId(peerId);
            if (peerCursor && peerCursor.isMine) return;

            const userId = peerCursor ? peerCursor.userId : peerId.substring(0, 8);
            const name = peerCursor ? peerCursor.name : 'プレイヤー';
            this.sendSystemNotice(`あなたと${userId}[${name}]の接続を確認しました。`);
          }, 1500);
        });
      })
      .on('DISCONNECT_PEER', event => {
        const peerId = event.data.peerId;
        
        if (this.disconnectTimers.has(peerId)) {
          this.disconnectTimers.get(peerId).forEach(t => clearTimeout(t));
        }

        const peerCursor = PeerCursor.findByPeerId(peerId);
        if (peerCursor && peerCursor.isMine) return;

        const userId = peerCursor ? peerCursor.userId : peerId.substring(0, 8);
        const name = peerCursor ? peerCursor.name : 'プレイヤー';

        const warningTimer = setTimeout(() => {
          this.ngZone.run(() => {
            this.sendSystemNotice(`${userId}[${name}] からあなたへの接続確認信号が30秒以上受信できません。通信障害の可能性があります。`);
          });
        }, 30000);

        const logoutTimer = setTimeout(() => {
          this.disconnectTimers.delete(peerId);
          if (this.notifiedPeers.has(peerId)) this.notifiedPeers.delete(peerId);

          this.ngZone.run(() => {
            this.sendSystemNotice(`${userId}[${name}]がログアウトしました。`);
          });
        }, 60000);

        this.disconnectTimers.set(peerId, [warningTimer, logoutTimer]);
      });
  }

  private sendSystemNotice(text: string) {
    if (this.chatTabs.length === 0) return;

    let targetTab = this.chatTabs.find(tab => tab.getAttribute('systemNoticeTarget') === 'true');
    if (!targetTab) {
      targetTab = this.chatTabs[0];
    }

    const myUserId = PeerCursor.myCursor ? PeerCursor.myCursor.userId : 'System';

    let context: ChatMessageContext = {
      from: myUserId, 
      to: myUserId,   
      name: 'システムメッセージ',
      imageIdentifier: '',
      timestamp: this.calcTimeStamp(targetTab),
      tag: 'system to-pl-system-message', 
      text: text
    };

    this.ngZone.run(() => {
      let message = targetTab.addMessage(context);
      if (message) {
        message.setAttribute('messColor', '#006633');
        message.setAttribute('isSystem', 'true');
      }
    });
  }

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
        this.setIntervalTimer();
      })
      .catch(error => {
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

sendSystemMessageOnePlayer(chatTab: ChatTab, text: string, sendTo: string, color?: string): ChatMessage {
    let _color = !color ? '#006633' : color;
    let chatMessage: ChatMessageContext = {
      from: this.findId(sendTo),
      to: this.findId(sendTo),
      name: 'システムメッセージ',
      imageIdentifier: '',
      timestamp: this.calcTimeStamp(chatTab),
      tag: 'DiceBot to-pl-system-message',
      text: text
    };
    let msg = chatTab.addMessage(chatMessage);
    if (msg) msg.setAttribute('messColor', _color);
    return msg;
  }

sendSystemMessageLastSendCharactor(text: string){
    const chatTabList = ObjectStore.instance.get<ChatTabList>('ChatTabList');
    const sysTab = chatTabList.chatTabs[0]; // systemMessageTabがないため、一番左のタブで代用
    const sendFrom = PeerCursor.myCursor.identifier;
    this.sendMessage(sysTab, text, null, sendFrom, null, '#006633', '');
  }

  // START: リリィ互換の送信処理（引数を調整し、エラーを回避）
// START: リリィ互換の送信処理（引数を調整し、エラーを回避）

    sendMessage(chatTab: ChatTab, text: string, gameSystem: GameSystemClass | string | null, sendFrom: string, sendTo?: string, color: string = '#000000', tachieId: string = ''): ChatMessage {
let gameTypeString = '';
    if (gameSystem) {
      if (typeof gameSystem === 'string') {
        gameTypeString = gameSystem;
      } else {
        gameTypeString = (gameSystem as GameSystemClass).ID;
      }
    }

    let _color = color || '#000000';
    let chatMessageTag: string = gameTypeString ? gameTypeString : '';
    
    // chat-input側で選択された立ち絵ID（tachieId）があればそれを、なければデフォルト画像を取得
    let finalImageIdentifier = tachieId || this.findImageIdentifier(sendFrom);

    let chatMessage: ChatMessageContext = {
      from: Network.peer.userId,
      to: this.findId(sendTo),
      name: this.makeMessageName(sendFrom, sendTo),
      imageIdentifier: finalImageIdentifier,
      timestamp: this.calcTimeStamp(chatTab),
      tag: chatMessageTag,
      text: text
    };

    // 立ち絵置き換えとテキスト整形
    let chkMessage = ' ' + text;
    let matchesArray = chkMessage.match(/\s[@＠](\S+)\s*$/i);
    if (matchesArray) {
      const matchHide = matchesArray[1].match(/^[hHｈＨ][iIｉＩ][dDｄＤ][eEｅＥ]$/);
      const matchNum = matchesArray[1].match(/(\d+)$/);

      if (matchHide) {
        chatMessage.imageIdentifier = '';
        chatMessage.text = text.replace(/([@＠]\S+\s*)$/i, '');
      } else if (matchNum) {
        const num: number = parseInt(matchNum[1]);
        const newIdentifier = this.findImageIdentifier(sendFrom, num);
        if (newIdentifier) {
          chatMessage.imageIdentifier = newIdentifier;
          chatMessage.text = text.replace(/([@＠]\S+\s*)$/i, '');
          let obj = ObjectStore.instance.get(sendFrom);
          if (obj instanceof GameCharacter) {
            obj.setAttribute('selectedTachieNum', matchNum[1]);
          }
        }
      } else {
        const tachieName = matchesArray[1];
        const newIdentifier = this.findImageIdentifierName(sendFrom, tachieName);
        if (newIdentifier) {
          chatMessage.imageIdentifier = newIdentifier;
          chatMessage.text = text.replace(/([@＠]\S+\s*)$/i, '');
          let obj = ObjectStore.instance.get(sendFrom);
          if (obj instanceof GameCharacter) {
            obj.setAttribute('selectedTachieNum', this._ImageIndex.toString());
          }
        }
      }
    }

    let message = chatTab.addMessage(chatMessage);
    if (message) {
      message.setAttribute('messColor', _color);
      message.setAttribute('sendFrom', sendFrom);
      message.setAttribute('imagePos', this.findImagePos(sendFrom).toString());
    }

    // 立ち絵表示用（チャットタブ上部の更新）
    if (message) {
      let charObj = ObjectStore.instance.get(sendFrom);
      if (charObj instanceof GameCharacter) {
        let pos = 0;
        let tachieRoot = charObj.detailDataElement ? charObj.detailDataElement.getFirstElementByName('立ち絵位置') : null;
        if (tachieRoot) {
          let posElement = tachieRoot.getFirstElementByName('POS');
          if (posElement) {
            let posValue = posElement.currentValue !== undefined ? posElement.currentValue : posElement.value;
            pos = parseInt(posValue.toString(), 10);
          }
        }
        if (isNaN(pos)) pos = 0;

        if (chatMessage.imageIdentifier && pos >= 0 && pos < 12) {
          if (!chatTab.imageIdentifier) {
            chatTab.imageIdentifier = [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '];
          }
          let newIdentifiers = chatTab.imageIdentifier.slice();
          newIdentifiers[pos] = chatMessage.imageIdentifier;
          chatTab.imageIdentifier = newIdentifiers; 
          chatTab.setAttribute('activeTachiePos', pos.toString());
        }
      }
    }

    return message;
  }
  // END

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

  private setLastControlInfoToPeer(sendFrom: string, imageIdentifier: string, imgindex: number, sendTo?: string) {
    // const sendFromName = this.findObjectName(sendFrom);
    // const peerCursor = PeerCursor.myCursor;

    // if (!peerCursor) return;

    // if (sendTo == null || sendTo.length < 1) {
    //   if (peerCursor.lastControlImageIdentifier != imageIdentifier){
    //     peerCursor.lastControlImageIdentifier = imageIdentifier;
    //   }
    //   if (peerCursor.lastControlCharacterName != sendFromName){
    //     peerCursor.lastControlCharacterName = sendFromName;
    //   }
    //   peerCursor.lastControlSendFrom = sendFrom;
    //   peerCursor.lastControlImageIndex = imgindex;
    // }
  }

  private _ImageIndex = 0;
  private findImageIdentifierName(sendFrom: string, name: string): string {
    let object = ObjectStore.instance.get(sendFrom);
    this._ImageIndex = 0;
    if (object instanceof GameCharacter && object.imageDataElement) {
      let data: DataElement = object.imageDataElement;
      for (let child of data.children) {
        if (child instanceof DataElement && child.name === 'imageIdentifier') {
          if (child.getAttribute('currentValue') === name){
            const img = ImageStorage.instance.get(<string> child.value);
            if (img) return img.identifier;
          }
        }
        this._ImageIndex++;
      }
      this._ImageIndex = 0;
      for (let child of data.children) {
        if (child instanceof DataElement && child.name === 'imageIdentifier') {
          if (child.getAttribute('currentValue') && child.getAttribute('currentValue').indexOf(name) === 0){
            const img = ImageStorage.instance.get(<string> child.value);
            if (img) return img.identifier;
          }
        }
        this._ImageIndex++;
      }
    }
    return '';
  }

  private findImageIdentifier(sendFrom: string, index: number = 0): string {
    let object = ObjectStore.instance.get(sendFrom);
    if (object instanceof GameCharacter) {
      let imageElements = object.imageDataElement ? object.imageDataElement.children.filter(e => (e as DataElement).name === 'imageIdentifier') : [];
      if (imageElements.length > index) {
        let img = ImageStorage.instance.get(<string> imageElements[index].value);
        if (img) return img.identifier;
      }
      return object.imageFile ? object.imageFile.identifier : '';
    } else if (object instanceof PeerCursor) {
      return object.imageIdentifier;
    }
    return '';
  }

  private findImagePos(identifier: string): number {
    let object = ObjectStore.instance.get(identifier);
    if (object instanceof GameCharacter) {
        let element = object.detailDataElement ? object.detailDataElement.getFirstElementByName('POS') : null; 
        if (element) {
            let val = element.currentValue !== undefined ? element.currentValue : element.value;
            let num = parseInt(val.toString(), 10);
            if (0 <= num && num <= 11) return num;
        }
        return 0;
    }
    return -1;
  }

  private calcTimeStamp(chatTab: ChatTab): number {
    let now = this.getTime();
    let latest = chatTab.latestTimeStamp;
    return now <= latest ? latest + 1 : now;
  }
}