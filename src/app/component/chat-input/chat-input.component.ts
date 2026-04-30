import { Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output, ViewChild, ChangeDetectorRef } from '@angular/core';
import GameSystemClass from 'bcdice/lib/game_system';
import { ChatMessage } from '@udonarium/chat-message';
import { ImageFile } from '@udonarium/core/file-storage/image-file';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';
import { EventSystem, Network } from '@udonarium/core/system';
import { PeerContext } from '@udonarium/core/system/network/peer-context';
import { ResettableTimeout } from '@udonarium/core/system/util/resettable-timeout';
import { DiceBot } from '@udonarium/dice-bot';
import { GameCharacter } from '@udonarium/game-character';
import { PeerCursor } from '@udonarium/peer-cursor';
import { TextViewComponent } from 'component/text-view/text-view.component';
import { BatchService } from 'service/batch.service';
import { ChatMessageService } from 'service/chat-message.service';
import { PanelOption, PanelService } from 'service/panel.service';
import { PointerDeviceService } from 'service/pointer-device.service';

import { ImageStorage } from '@udonarium/core/file-storage/image-storage';
import { ChatTab } from '@udonarium/chat-tab';
import { DataElement } from '@udonarium/data-element';

import { ChatColorSettingComponent } from '../chat-color-setting/chat-color-setting.component';

@Component({
  selector: 'chat-input',
  templateUrl: './chat-input.component.html',
  styleUrls: ['./chat-input.component.css']
})
export class ChatInputComponent implements OnInit, OnDestroy {
  @ViewChild('textArea', { static: true }) textAreaElementRef: ElementRef;

  @Input() onlyCharacters: boolean = false;
  @Input() chatTabidentifier: string = '';

  @Input('gameType') _gameType: string = '';
  @Output() gameTypeChange = new EventEmitter<string>();
get gameType(): string { 
    return this._gameType ? this._gameType : 'DiceBot'; 
  }
  
  set gameType(gameType: string) { 
    this._gameType = gameType; 
    this.gameTypeChange.emit(gameType); 
  }

  @Input('sendFrom') _sendFrom: string = this.myPeer ? this.myPeer.identifier : '';
  @Output() sendFromChange = new EventEmitter<string>();
  get sendFrom(): string { return this._sendFrom };
  set sendFrom(sendFrom: string) { 
    let hasChanged = this._sendFrom !== sendFrom;
    this._sendFrom = sendFrom; 
    this.sendFromChange.emit(sendFrom); 
    if (hasChanged) {
      this.tachieIndex = 0;
    }
  }

  @Input('sendTo') _sendTo: string = '';
  @Output() sendToChange = new EventEmitter<string>();
  get sendTo(): string { return this._sendTo };
  set sendTo(sendTo: string) { this._sendTo = sendTo; this.sendToChange.emit(sendTo); }

  @Input('text') _text: string = '';
  @Output() textChange = new EventEmitter<string>();
  get text(): string { return this._text };
  set text(text: string) { this._text = text; this.textChange.emit(text); }

  public isPaletteMode: boolean = false;

  @Output() chat = new EventEmitter<{ text: string, gameType: string, sendFrom: string, sendTo: string, color: string, tachieId: string }>();

  // START: 現在の仕様の色と立ち絵管理
  get character(): GameCharacter | null {
    let object = ObjectStore.instance.get(this.sendFrom);
    return object instanceof GameCharacter ? object : null;
  }

  get chatColor(): string {
    const char = this.character;
    if (char) {
      // キャラクターの3色パレットから現在選択中の色を返す
      return char.chatColorCode[this.colorNum];
    }
    // プレイヤー（自分）の3色パレットから現在選択中の色を返す
    return this.myPeer ? this.myPeer.chatColorCode[this.colorNum] : '#000000';
  }

  set chatColor(color: string) {
    // 互換性維持のためセッターを残しますが、
    // 基本的には showColorSetting() 経由で chatColorCode 配列を直接書き換えます
    const char = this.character;
    if (char) {
      char.chatColorCode[this.colorNum] = color;
    } else if (this.myPeer) {
      this.myPeer.chatColorCode[this.colorNum] = color;
    }
  }

  get tachieElements(): DataElement[] {
    const char = this.character;
    if (!char || !char.imageDataElement) return [];
    return char.imageDataElement.children.filter(e => (e as DataElement).name === 'imageIdentifier') as DataElement[];
  }

  _tachieIndex: number = 0;
  get tachieIndex(): number {
    const max = this.maxTachieIndex;
    return this._tachieIndex > max ? max : this._tachieIndex;
  }
  set tachieIndex(val: number) { this._tachieIndex = val; }

  get maxTachieIndex(): number {
    return Math.max(0, this.tachieElements.length - 1);
  }

  get currentTachieName(): string {
    const elements = this.tachieElements;
    if (elements.length === 0) return '基本画像';
    return elements[this.tachieIndex]?.currentValue?.toString() || `差分${this.tachieIndex}`;
  }

  get imageFile(): ImageFile {
    let object = ObjectStore.instance.get(this.sendFrom);
    let image: ImageFile = null;
    if (object instanceof GameCharacter) {
      const elements = this.tachieElements;
      if (elements.length > 0 && this.tachieIndex < elements.length) {
        image = ImageStorage.instance.get(elements[this.tachieIndex].value as string);
      }
      if (!image) image = object.imageFile;
    } else if (object instanceof PeerCursor) {
      image = object.image;
    }
    return image ? image : ImageFile.Empty;
  }
  // END

  gameHelp: string = '';

  get isDirect(): boolean { return this.sendTo != null && this.sendTo.length ? true : false; }

  private shouldUpdateCharacterList: boolean = true;
  private _gameCharacters: GameCharacter[] = [];
  get gameCharacters(): GameCharacter[] {
    if (this.shouldUpdateCharacterList) {
      this.shouldUpdateCharacterList = false;
      this._gameCharacters = ObjectStore.instance
        .getObjects<GameCharacter>(GameCharacter)
        .filter(character => this.allowsChat(character));
    }
    return this._gameCharacters;
  }

  private writingEventInterval: NodeJS.Timeout = null;
  private previousWritingLength: number = 0;
  writingPeers: Map<string, ResettableTimeout> = new Map();
  writingPeerNames: string[] = [];

  get diceBotInfos() { return DiceBot.diceBotInfos }
  get myPeer(): PeerCursor { return PeerCursor.myCursor; }
  get otherPeers(): PeerCursor[] { return ObjectStore.instance.getObjects(PeerCursor); }

  private calcFitHeightInterval: NodeJS.Timeout = null;


  // 選択中の色の番号 (0:第1色, 1:第2色, 2:第3色)
  public colorNum: number = 0;

  // ボタンの見た目（ボーダーや角丸）を管理するプロパティ
  get colorSelectorBoxBorder_0() { return this.colorNum == 0 ? 2 : 1; }
  get colorSelectorBoxBorder_1() { return this.colorNum == 1 ? 2 : 1; }
  get colorSelectorBoxBorder_2() { return this.colorNum == 2 ? 2 : 1; }
  get colorSelectorRadius_0() { return this.colorNum == 0 ? '50%' : '0'; }
  get colorSelectorRadius_1() { return this.colorNum == 1 ? '50%' : '0'; }
  get colorSelectorRadius_2() { return this.colorNum == 2 ? '50%' : '0'; }

  // 画面に表示する色コードを取得するゲッター
  get chatColorCode_0() { return this.getChatColorByIndex(0); }
  get chatColorCode_1() { return this.getChatColorByIndex(1); }
  get chatColorCode_2() { return this.getChatColorByIndex(2); }

  private getChatColorByIndex(index: number): string {
    const char = this.character;
    if (char) return char.chatColorCode[index];
    return this.myPeer ? this.myPeer.chatColorCode[index] : '#000000';
  }


  constructor(
    private ngZone: NgZone,
    public chatMessageService: ChatMessageService,
    private batchService: BatchService,
    private panelService: PanelService,
    private pointerDeviceService: PointerDeviceService,
    private changeDetector: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    EventSystem.register(this)
      .on('MESSAGE_ADDED', event => {
        if (event.data.tabIdentifier !== this.chatTabidentifier) return;
        let message = ObjectStore.instance.get<ChatMessage>(event.data.messageIdentifier);
        let peerCursor = ObjectStore.instance.getObjects<PeerCursor>(PeerCursor).find(obj => obj.userId === message.from);
        let sendFrom = peerCursor ? peerCursor.peerId : '?';
        if (this.writingPeers.has(sendFrom)) {
          this.writingPeers.get(sendFrom).stop();
          this.writingPeers.delete(sendFrom);
          this.updateWritingPeerNames();
        }
      })
      .on(`UPDATE_GAME_OBJECT/aliasName/${GameCharacter.aliasName}`, event => {
        this.shouldUpdateCharacterList = true;
        this.changeDetector.markForCheck();
        if (event.data.identifier !== this.sendFrom) return;
        let gameCharacter = ObjectStore.instance.get<GameCharacter>(event.data.identifier);
        
        if (gameCharacter && !this.allowsChat(gameCharacter) && !this.isPaletteMode) {
          if (0 < this.gameCharacters.length && this.onlyCharacters) {
            this.sendFrom = this.gameCharacters[0].identifier;
          } else {
            this.sendFrom = this.myPeer.identifier;
          }
        }
      })
      .on('DISCONNECT_PEER', event => {
        let object = ObjectStore.instance.get(this.sendTo);
        if (object instanceof PeerCursor && object.peerId === event.data.peerId) {
          this.sendTo = '';
        }
      })
      .on<string>('WRITING_A_MESSAGE', event => {
        if (event.isSendFromSelf || event.data !== this.chatTabidentifier) return;
        if (!this.writingPeers.has(event.sendFrom)) {
          this.writingPeers.set(event.sendFrom, new ResettableTimeout(() => {
            this.writingPeers.delete(event.sendFrom);
            this.updateWritingPeerNames();
            this.ngZone.run(() => { });
          }, 2000));
        }
        this.writingPeers.get(event.sendFrom).reset();
        this.updateWritingPeerNames();
        this.batchService.requireChangeDetection();
      });
  }

  ngOnDestroy() {
    EventSystem.unregister(this);
    this.batchService.remove(this);
  }

  private updateWritingPeerNames() {
    this.writingPeerNames = Array.from(this.writingPeers.keys()).map(peerId => {
      let peer = PeerCursor.findByPeerId(peerId);
      return peer ? peer.name : '';
    });
  }

  onInput() {
    if (this.writingEventInterval === null && this.previousWritingLength <= this.text.length) {
      let sendTo: string = null;
      if (this.isDirect) {
        let object = ObjectStore.instance.get(this.sendTo);
        if (object instanceof PeerCursor) {
          let peer = PeerContext.parse(object.peerId);
          if (peer) sendTo = peer.peerId;
        }
      }
      EventSystem.call('WRITING_A_MESSAGE', this.chatTabidentifier, sendTo);
      this.writingEventInterval = setTimeout(() => {
        this.writingEventInterval = null;
      }, 200);
    }
    this.previousWritingLength = this.text.length;
    this.calcFitHeight();
  }

  // START: リリィ互換 履歴管理
  private history: string[] = new Array();
  private currentHistoryIndex: number = -1;
  private static MAX_HISTORY_NUM = 1000;

  // 型エラーを避けるために any で受け取る
  moveHistory(event: any, direction: number) {
    if (event) event.preventDefault();
    if (direction < 0 && this.currentHistoryIndex < 0) {
      this.currentHistoryIndex = this.history.length - 1;
    } else if (direction > 0 && this.currentHistoryIndex >= this.history.length - 1) {
      this.currentHistoryIndex = -1;
    } else {
      this.currentHistoryIndex = this.currentHistoryIndex + direction;
    }

    let histText: string;
    if (this.currentHistoryIndex < 0) {
      histText = '';
    } else {
      histText = this.history[this.currentHistoryIndex];
    }
    this.text = histText;
    this.previousWritingLength = this.text.length;
    this.kickCalcFitHeight();
  }
  // END

  // 型エラーを避けるために any で受け取る
  sendChat(event: any) {
    if (event) event.preventDefault();

    if (!this.text.length) return;
    if (event && event.keyCode !== 13) return;

    if (!this.sendFrom.length) this.sendFrom = this.myPeer.identifier;

    // 履歴に追加
    if (this.history.length >= ChatInputComponent.MAX_HISTORY_NUM) {
      this.history.shift();
    }
    this.history.push(this.text);
    this.currentHistoryIndex = -1;

    let selectedTachieId = '';
    let statusChangeResult = '';
    const character = this.character;

    if (character) {
       this.text = this.replaceMaxValueReferences(this.text, character);
       
       const elements = this.tachieElements;
       if (elements.length > 0 && this.tachieIndex < elements.length) {
         selectedTachieId = elements[this.tachieIndex].value as string;
       } else if (character.imageFile) {
         selectedTachieId = character.imageFile.identifier;
       }

       statusChangeResult = this.applyStatusChanges(this.text, character);
    } else if (this.myPeer) {
       selectedTachieId = this.myPeer.imageIdentifier;
    }

    this.chat.emit({ 
      text: this.text, 
      gameType: this.gameType, 
      sendFrom: this.sendFrom, 
      sendTo: this.sendTo, 
      color: this.chatColor, 
      tachieId: selectedTachieId 
    });

    if (statusChangeResult && character) {
       setTimeout(() => {
          let chatTab = ObjectStore.instance.get<ChatTab>(this.chatTabidentifier);
          if (chatTab) {
             let msg = new ChatMessage();
             msg.from = 'System';
             msg.to = this.sendTo;
             msg.name = character.name;
             msg.tag = 'system';
             msg.value = statusChangeResult; 
             msg.setAttribute('messColor', this.chatColor);
             msg.setAttribute('originFrom', this.myPeer.identifier);
             msg.setAttribute('fixd', 'false'); 
             msg.setAttribute('timestamp', this.chatMessageService.getTime() + 1);
             msg.initialize();
             chatTab.appendChild(msg);
             EventSystem.trigger('MESSAGE_ADDED', { tabIdentifier: chatTab.identifier, messageIdentifier: msg.identifier });
          }
       }, 50); 
    }

    this.text = '';
    this.previousWritingLength = this.text.length;
    this.kickCalcFitHeight();
  }

  kickCalcFitHeight() {
    if (this.calcFitHeightInterval == null) {
      this.calcFitHeightInterval = setTimeout(() => {
        this.calcFitHeightInterval = null;
        this.calcFitHeight();
      }, 0)
    }
  }

  calcFitHeight() {
    let textArea: HTMLTextAreaElement = this.textAreaElementRef.nativeElement;
    textArea.style.height = '';
    if (textArea.scrollHeight >= textArea.offsetHeight) {
      textArea.style.height = textArea.scrollHeight + 'px';
    }
  }

  loadDiceBot(gameType: string) {
    DiceBot.getHelpMessage(gameType).then(help => { });
  }

  isGameTypeInList(): boolean{
    for( let diceBotInfo of this.diceBotInfos ){
      if( diceBotInfo.id === this.gameType ){ return true ;}
    }
    return false;
  }

  showDicebotHelp() {
    DiceBot.getHelpMessage(this.gameType).then(help => {
      this.gameHelp = help;
      let gameName: string = 'ダイスボット';
      for (let diceBotInfo of DiceBot.diceBotInfos) {
        if (diceBotInfo.id === this.gameType) {
          gameName = 'ダイスボット<' + diceBotInfo.name + '＞'
        }
      }
      gameName += 'の説明';

      let coordinate = this.pointerDeviceService.pointers[0];
      let option: PanelOption = { left: coordinate.x, top: coordinate.y, width: 600, height: 500 };
      let textView = this.panelService.open(TextViewComponent, option);
      textView.title = gameName;
      textView.text = '【ダイスボット】チャットにダイス用の文字を入力するとダイスロールが可能\n' + this.gameHelp;
    });
  }

private allowsChat(gameCharacter: GameCharacter): boolean {
    if (gameCharacter) {
      if (gameCharacter.nonTalkFlag) return false; 
    }
    switch (gameCharacter.location.name) {
      case 'table':
      case this.myPeer.peerId:
        return true;
      case 'graveyard':
        return false;
      default:
        for (const peer of Network.peers) {
          if (peer.isOpen && gameCharacter.location.name === peer.peerId) {
            return false;
          }
        }
        return true;
    }
  }

  private replaceMaxValueReferences(text: string, character: GameCharacter): string {
    if (!text || !character) return text;
    return text.replace(/\{([^}]+)\^\}/g, (match, attrName) => {
      let targetElm = character.detailDataElement?.getFirstElementByName(attrName) ||
                      character.commonDataElement?.getFirstElementByName(attrName);
      if (targetElm) {
        const isResource = targetElm.type === 'numberResource' || targetElm.currentValue !== undefined;
        if (isResource && targetElm.value != null) return targetElm.value.toString();
      }
      return match;
    });
  }

  private applyStatusChanges(text: string, character: GameCharacter): string {
    const regex = /:([^\s:+\-*/=^]+)(\^?)([+\-*/=])([0-9dD()+\-*/]+)([LZ]*)/g;
    let match;
    let isUpdated = false;
    let results: string[] = [];

    while ((match = regex.exec(text)) !== null) {
      const attrName = match[1];
      const isMax = match[2] === '^';
      const operator = match[3];
      const exprStr = match[4];
      const flags = match[5] || '';
      const flagL = flags.includes('L');
      const flagZ = flags.includes('Z');

      let targetElm = character.detailDataElement?.getFirstElementByName(attrName) ||
                      character.commonDataElement?.getFirstElementByName(attrName);

      if (targetElm) {
        const isResource = targetElm.type === 'numberResource' || targetElm.currentValue !== undefined;
        const currentVal = (isResource && !isMax) ? targetElm.currentValue : targetElm.value;
        const currentNum = Number(currentVal);

        let displayExpr = exprStr.replace(/(\d*)[dD](\d*)/g, (m, countStr, faceStr) => {
          let count = countStr === '' ? 1 : parseInt(countStr);
          let faces = faceStr === '' ? 6 : parseInt(faceStr);
          let sum = 0;
          let localDiceResults: number[] = [];
          for (let i = 0; i < count; i++) {
            let r = Math.floor(Math.random() * faces) + 1;
            sum += r;
            localDiceResults.push(r);
          }
          return `${sum}[${localDiceResults.join(',')}]`;
        });

        let evalExpr = displayExpr.replace(/\[.*?\]/g, '');
        let newVal = currentNum;
        let isCalculated = false;

        if (operator === '=') {
          try {
             let evaluated = new Function('"use strict";return (' + evalExpr + ')')();
             if (!Number.isNaN(evaluated)) { newVal = evaluated; isCalculated = true; }
          } catch(e) { }
        } else {
          try {
             let evaluated = new Function('"use strict";return (' + currentNum + operator + evalExpr + ')')();
             if (!Number.isNaN(evaluated)) { newVal = evaluated; isCalculated = true; }
          } catch(e) { }
        }

        if (isCalculated) {
          let delta = newVal - currentNum;
          let limitText = "";

          if (flagZ) {
             if (operator === '+' && delta < 0) { newVal = currentNum; limitText += "(0制限)"; }
             if (operator === '-' && delta > 0) { newVal = currentNum; limitText += "(0制限)"; }
          }

          if (flagL && isResource && !isMax) {
             let maxNum = Number(targetElm.value);
             if (!Number.isNaN(maxNum)) {
                if (newVal > maxNum) { newVal = maxNum; limitText += "(最大)"; } 
                else if (newVal < 0) { newVal = 0; limitText += "(最小)"; }
             }
          }

          if (isResource && !isMax) targetElm.currentValue = newVal;
          else targetElm.value = newVal;
          
          isUpdated = true;

          let attrLabel = isMax ? `${attrName}(最大値)` : attrName;
          if (operator === '=') results.push(`${attrLabel}:${currentNum}＞${newVal}${limitText}`);
          else results.push(`${attrLabel}:${currentNum}${operator}${displayExpr}＞${newVal}${limitText}`);
          
        } else if (operator === '=') {
          if (isResource && !isMax) targetElm.currentValue = exprStr;
          else targetElm.value = exprStr;
          
          isUpdated = true;
          let attrLabel = isMax ? `${attrName}(最大値)` : attrName;
          results.push(`${attrLabel}:${currentVal}＞${exprStr}`);
        }
      }
    }

    if (isUpdated) character.update();
    return results.join('  ');
  }

  // 使用する色を選択する
  setColorNum(num: number) {
    this.colorNum = num;
  }

  // 色設定ポップアップを開く
  showColorSetting() {
    let coordinate = this.pointerDeviceService.pointers[0];
    let option: PanelOption = { left: coordinate.x - 100, top: coordinate.y - 100, width: 300, height: 150 };
    let component = this.panelService.open<any>(ChatColorSettingComponent, option); // ChatColorSettingComponentはインポートが必要
    component.tabletopObject = this.character;
  }
}