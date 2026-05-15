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

// 一番上付近に追記
import { StringUtil } from '@udonarium/core/system/util/string-util';

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
                 let ringtoneVol = localStorage.getItem('ringtoneVolume');
                 customChime.volume = ringtoneVol !== null ? parseFloat(ringtoneVol) : 0.5;
                 
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
                 let ringtoneVol = localStorage.getItem('ringtoneVolume');
                 customChime.volume = ringtoneVol !== null ? parseFloat(ringtoneVol) : 0.5;
                 
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
      imageIdentifier: '', // リリィ版に準拠
      timestamp: this.calcTimeStamp(targetTab),
      tag: 'system to-pl-system-message', 
      text: text,
      imagePos: -1, // リリィ版に準拠
      messColor: '#006633', // リリィ版に準拠
      sendFrom: null // リリィ版に準拠
    } as any;

    this.ngZone.run(() => {
      let message = targetTab.addMessage(context);
      if (message) {
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

  // リリィ互換: システムメッセージ専用（引数・戻り値をリリィ版通りに完全再現）
  sendSystemMessageOnePlayer(chatTab: ChatTab, text: string, sendTo: string, color?: string): ChatMessage {
    let _color = !color ? '#006633' : color;
    let chatMessage: ChatMessageContext = {
      from: this.findId(sendTo),
      to: this.findId(sendTo),
      name: 'システムメッセージ',
      imageIdentifier: '', // lily
      timestamp: this.calcTimeStamp(chatTab),
      tag: 'DiceBot to-pl-system-message',
      text: text,
      imagePos: -1, // lily
      messColor: _color, // lily
      sendFrom: null // lily
    } as any;
    return chatTab.addMessage(chatMessage);
  }

  // リリィ互換: 最終発言キャラでシステム発言
  sendSystemMessageLastSendCharactor(text: string){
    const chatTabList = ObjectStore.instance.get<ChatTabList>('ChatTabList');
    const sysTab = chatTabList.chatTabs[0]; // Vanilla向けの代用
    
    // PeerCursorに型定義が存在しない可能性があるため、anyキャストで安全にリリィのプロパティへアクセス
    const peerCursorAny = PeerCursor.myCursor as any;
    const sendFrom = peerCursorAny.lastControlSendFrom ? peerCursorAny.lastControlSendFrom : PeerCursor.myCursor.identifier;
    let imgIndex = peerCursorAny.lastControlImageIndex || 0;
    
    const imageIdentifier = this.findImageIdentifier(sendFrom, imgIndex);
    if (imageIdentifier != peerCursorAny.lastControlImageIdentifier ) imgIndex = 0;
    
    this.sendMessage(sysTab, text, null, sendFrom, null, '#006633', imageIdentifier);
  }

  // リリィ互換の送信処理（引数はVanilla版シグネチャを保護しつつ、内部ロジックはリリィに統合）
  sendMessage(chatTab: ChatTab, text: string, gameSystem: GameSystemClass | string | null, sendFrom: string, sendTo?: string, color: string = '#000000', tachieId: string = ''): ChatMessage {
    
    console.log(`[Debug] ====== sendMessage 処理開始 ======`);
    
    let gameSysClass: any = null;
    if (gameSystem) {
      if (typeof gameSystem === 'string') {
        gameSysClass = (DiceBot as any).getGameSystemSync ? (DiceBot as any).getGameSystemSync(gameSystem) : null;
      } else {
        gameSysClass = gameSystem;
      }
    }

    let dicebot = ObjectStore.instance.get<DiceBot>('DiceBot');
    let chatMessageTag: string;
    
    if (gameSysClass == null) {
      chatMessageTag = (typeof gameSystem === 'string') ? gameSystem : '';
    } else {
      let isSecretDice = dicebot ? (dicebot as any).checkSecretDiceCommand(gameSysClass, text) : false;
      let isSecretEdit = dicebot ? (dicebot as any).checkSecretEditCommand(text) : false;
      
      if (isSecretDice || isSecretEdit) {
        chatMessageTag = `${gameSysClass.ID} secret`;
      } else {
        chatMessageTag = gameSysClass.ID;
      }
    }

    let _color = color || '#000000';
    let finalImageIdentifier = tachieId || this.findImageIdentifier(sendFrom);
    
    // 【重要】リリィ版通り、コンテキスト初期化時にすべての情報を渡すことで二重管理を防ぎます
    let pos = this.findImagePos(sendFrom);

    let chatMessage: ChatMessageContext = {
      from: Network.peer.userId,
      to: this.findId(sendTo),
      name: this.makeMessageName(sendFrom, sendTo),
      imageIdentifier: finalImageIdentifier, // lily
      timestamp: this.calcTimeStamp(chatTab),
      tag: chatMessageTag,
      text: text,
      imagePos: pos, // lily
      messColor: _color, // lily
      sendFrom: sendFrom // lily
    } as any; // ChatMessageContextにプロパティが存在しないエラーを回避するためのキャスト

    this.setLastControlInfoToPeer(sendFrom, finalImageIdentifier, 0, sendTo);

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

    return chatTab.addMessage(chatMessage);
  }

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

  // リリィ互換: システムメッセージ発言用に最後に使用した立ち絵を記録する処理
  private setLastControlInfoToPeer(sendFrom: string, imageIdentifier: string, imgindex: number, sendTo?: string) {
    const sendFromName = this.findObjectName(sendFrom);
    const peerCursorAny = PeerCursor.myCursor as any;

    if (!peerCursorAny) return;

    if (sendTo == null || sendTo.length < 1) {
      if (peerCursorAny.lastControlImageIdentifier != imageIdentifier){
        peerCursorAny.lastControlImageIdentifier = imageIdentifier;
      }
      if (peerCursorAny.lastControlCharacterName != sendFromName){
        peerCursorAny.lastControlCharacterName = sendFromName;
      }
      peerCursorAny.lastControlSendFrom = sendFrom;
      peerCursorAny.lastControlImageIndex = imgindex;
    } else {
      // 秘話時は操作なし
    }
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

  public calcTimeStamp(chatTab: ChatTab): number {
    let now = this.getTime();
    let latest = chatTab.latestTimeStamp;
    return now <= latest ? latest + 1 : now;
  }
}