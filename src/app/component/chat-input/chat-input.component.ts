
import { Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output, ViewChild, ChangeDetectorRef } from '@angular/core';
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

import { DataElement } from '@udonarium/data-element';
import { ImageStorage } from '@udonarium/core/file-storage/image-storage';

import { ChatTab } from '@udonarium/chat-tab';


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
  get gameType(): string { return this._gameType };
  set gameType(gameType: string) { this._gameType = gameType; this.gameTypeChange.emit(gameType); }

  @Input('sendFrom') _sendFrom: string = this.myPeer ? this.myPeer.identifier : '';
  @Output() sendFromChange = new EventEmitter<string>();
  get sendFrom(): string { return this._sendFrom };
  // set sendFrom(sendFrom: string) { this._sendFrom = sendFrom; this.sendFromChange.emit(sendFrom); }
  // ▼▼▼ 修正：切り替わり時に tachieIndex を 0 にリセット ▼▼▼
  set sendFrom(sendFrom: string) { 
    let hasChanged = this._sendFrom !== sendFrom;
    this._sendFrom = sendFrom; 
    this.sendFromChange.emit(sendFrom); 
    
    if (hasChanged) {
      this.tachieIndex = 0;
    }
  }
  // ▲▲▲ 修正ここまで ▲▲▲

  @Input('sendTo') _sendTo: string = '';
  @Output() sendToChange = new EventEmitter<string>();
  get sendTo(): string { return this._sendTo };
  set sendTo(sendTo: string) { this._sendTo = sendTo; this.sendToChange.emit(sendTo); }

  @Input('text') _text: string = '';
  @Output() textChange = new EventEmitter<string>();
  get text(): string { return this._text };
  set text(text: string) { this._text = text; this.textChange.emit(text); }

  // ーーーここから変更ーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーー
  tachiePos: number = 0;         // デフォルトのPOS（0）

  // textやgameTypeと一緒に、colorとposも渡せるように拡張
// ーーーここから修正（クラッシュ回避＆色の保存ロジック復元）ーーー
  get character(): GameCharacter | null {
    let object = ObjectStore.instance.get(this.sendFrom);
    // PeerCursor（プレイヤー自身）などが混ざってクラッシュしないよう、GameCharacter型か厳密にチェックします
    return object instanceof GameCharacter ? object : null;
  }

  // ーーーリリィ互換：色の保存・取得ーーー
// ーーーリリィ互換：色の保存・取得（完全独立版）ーーー
  get chatColor(): string {
    const char = this.character;
    if (char) {
      // 1. リリィ互換のオブジェクトプロパティから色を取得
      if (char.chatColorCode && char.chatColorCode['0']) {
        return char.chatColorCode['0'];
      }
      // 2. 過去の独自方式で保存したコマへの後方互換
      if (char.detailDataElement) {
        let colorElm = char.detailDataElement.getFirstElementByName('chatColor');
        if (colorElm && colorElm.value) return colorElm.value.toString();
      }
      // 【修正】コマを選択しているが、まだ色が未設定（新規作成時など）の場合は、
      // プレイヤー個人の色を呼ばずに、デフォルトの黒（#000000）を返す。
      return '#000000';
    }
    
    // コマを選択していない（プレイヤー自身としての発言）場合のみ、ブラウザ保存の色を呼ぶ
    return localStorage.getItem('myChatColor') || '#000000';
  }

  set chatColor(color: string) {
    const char = this.character;
    if (char) {
      // リリィ互換のオブジェクトプロパティに色を保存
      if (!char.chatColorCode) {
        char.chatColorCode = { '0': '', '1': '', '2': '' };
      }
      char.chatColorCode['0'] = color;
    } else {
      localStorage.setItem('myChatColor', color);
    }
  }
//   // キャラクターの色を保存・取得するロジック
//   get chatColor(): string {
//     const char = this.character;
//     if (char && char.detailDataElement) {
//       let colorElm = char.detailDataElement.getFirstElementByName('chatColor');
//       return colorElm && colorElm.value ? colorElm.value.toString() : '#000000';
//     }
//     return localStorage.getItem('myChatColor') || '#000000'; // コマ未選択時はプレイヤー毎に保存
//   }

// set chatColor(color: string) {
//     const char = this.character;
//     if (char && char.detailDataElement) {
//       let colorElm = char.detailDataElement.getFirstElementByName('chatColor');
//       if (!colorElm) {
//         // 修正：引数なしで生成し、プロパティとして名前と色を設定します
//         colorElm = new DataElement();
//         colorElm.name = 'chatColor';
//         colorElm.value = color;
//         char.detailDataElement.appendChild(colorElm);
//       } else {
//         colorElm.value = color;
//       }
//     } else {
//       localStorage.setItem('myChatColor', color);
//     }
//   }

  // 立ち絵リストを抽出するロジック
  // ーーーリリィ互換：立ち絵リストの抽出ーーー
// --- START: 立ち絵リストを専用フォルダから取得するように修正 ---

// --- START: チャット入力欄の立ち絵取得をリリィ互換（フラット）に統一 ---
  get tachieElements(): DataElement[] {
    const char = this.character;
    if (!char || !char.imageDataElement) return [];
    // 'tachie' フォルダではなく、直下の 'imageIdentifier' を取得
    return char.imageDataElement.children.filter(e => (e as DataElement).name === 'imageIdentifier') as DataElement[];
  }
  // get tachieElements(): DataElement[] {
  //   const char = this.character;
  //   if (!char || !char.imageDataElement) return [];
    
  //   // 独立した 'tachie' フォルダを探し、その中の画像を取得する
  //   let root = char.imageDataElement.getFirstElementByName('tachie');
  //   return root ? (root.children as DataElement[]).filter(e => e.type === 'image') : [];
  // }
// --- END ---
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
    // リリィ版は name ではなく currentValue に差分名が保存される
    return elements[this.tachieIndex]?.currentValue?.toString() || `差分${this.tachieIndex}`;
  }
// ーーー変更：純粋に立ち絵フォルダのみを参照するように修正ーーー
  // get tachieElements(): DataElement[] {
  //   const char = this.character;
  //   if (!char || !char.imageDataElement) return [];
    
  //   // 立ち絵ルート要素（フォルダ）のみを探す
  //   const root = char.imageDataElement.getFirstElementByName('tachie')
  //             || char.detailDataElement?.getFirstElementByName('tachie');
              
  //   // フォルダがあればその中身を、なければ空の配列を返す（コマ本体の画像を無理やり混ぜない）
  //   if (root) return root.children as DataElement[];
  //   return [];
  // }
  // ーーーここまで変更ーーー

  // _tachieIndex: number = 0;
  // get tachieIndex(): number {
  //   const max = this.maxTachieIndex;
  //   return this._tachieIndex > max ? max : this._tachieIndex;
  // }
  // set tachieIndex(val: number) { this._tachieIndex = val; }

  // get maxTachieIndex(): number {
  //   return Math.max(0, this.tachieElements.length - 1);
  // }

  // get currentTachieName(): string {
  //   const elements = this.tachieElements;
  //   if (elements.length === 0) return '基本画像';
  //   return elements[this.tachieIndex]?.name?.toString() || `差分${this.tachieIndex}`;
  // }

  // 送信イベントに立ち絵ID（tachieId）を追加
  @Output() chat = new EventEmitter<{ text: string, gameType: string, sendFrom: string, sendTo: string, color: string, tachieId: string }>();
  // ーーーここまで追加・変更ーーー
  // @Output() chat = new EventEmitter<{ text: string, gameType: string, sendFrom: string, sendTo: string, color: string, pos: number }>();
  // ーーーここまで変更ーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーーー

  // @Output() chat = new EventEmitter<{ text: string, gameType: string, sendFrom: string, sendTo: string }>();

  get isDirect(): boolean { return this.sendTo != null && this.sendTo.length ? true : false }
  gameHelp: string = '';

  //書き換え
  get imageFile(): ImageFile {
    let object = ObjectStore.instance.get(this.sendFrom);
    let image: ImageFile = null;
    if (object instanceof GameCharacter) {
      const elements = this.tachieElements;
      // スライダーで選ばれた立ち絵があればそれを表示
      if (elements.length > 0 && this.tachieIndex < elements.length) {
        image = ImageStorage.instance.get(elements[this.tachieIndex].value as string);
      }
      if (!image) image = object.imageFile; // なければ基本画像
    } else if (object instanceof PeerCursor) {
      image = object.image;
    }
    return image ? image : ImageFile.Empty;
  }
  // get imageFile(): ImageFile {
  //   let object = ObjectStore.instance.get(this.sendFrom);
  //   let image: ImageFile = null;
  //   if (object instanceof GameCharacter) {
  //     image = object.imageFile;
  //   } else if (object instanceof PeerCursor) {
  //     image = object.image;
  //   }
  //   return image ? image : ImageFile.Empty;
  // }

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

  constructor(
    private ngZone: NgZone,
    public chatMessageService: ChatMessageService,
    private batchService: BatchService,
    private panelService: PanelService,
    private pointerDeviceService: PointerDeviceService,
    // ▼▼▼ 追加：再描画を指示するためのサービスを注入 ▼▼▼
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

// ▼▼▼ 追加：キャラクターが更新されたらリスト（プルダウン）を即座に再描画 ▼▼▼
        this.changeDetector.markForCheck();
        // ▲▲▲ 追加ここまで ▲▲▲

        if (event.data.identifier !== this.sendFrom) return;
        let gameCharacter = ObjectStore.instance.get<GameCharacter>(event.data.identifier);
        if (gameCharacter && !this.allowsChat(gameCharacter)) {
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

  sendChat(event: Partial<KeyboardEvent>) {
    if (event) event.preventDefault();
    if (!this.text.length) return;
    if (event && event.keyCode !== 13) return;

    if (!this.sendFrom.length) this.sendFrom = this.myPeer.identifier;

    // 選択中の立ち絵IDを取得して送信データに乗せる
    let selectedTachieId = '';
    let statusChangeResult = ''; // ▼ 新規追加：結果を受け取る変数
    
    if (this.character) {
       const elements = this.tachieElements;
       if (elements.length > 0 && this.tachieIndex < elements.length) {
         selectedTachieId = elements[this.tachieIndex].value as string;
       } else if (this.character.imageFile) {
         selectedTachieId = this.character.imageFile.identifier;
       }

// ▼▼▼ 新規追加：チャット送信時にステータス変更コマンドを解析・適用する ▼▼▼
       //this.applyStatusChanges(this.text, this.character);
       // ▲▲▲ 新規追加ここまで ▲▲▲
       // ▼▼▼ 変更：適用処理を呼び出し、結果の文字列を受け取る ▼▼▼
       statusChangeResult = this.applyStatusChanges(this.text, this.character);
       // ▲▲▲ 変更ここまで ▲▲▲

    } else if (this.myPeer) {
       selectedTachieId = this.myPeer.imageIdentifier;
    }

    this.chat.emit({ text: this.text, gameType: this.gameType, sendFrom: this.sendFrom, sendTo: this.sendTo, color: this.chatColor, tachieId: selectedTachieId });

// ▼▼▼ 新規追加：ステータス変更があった場合、システムメッセージを追記する ▼▼▼
    if (statusChangeResult && this.character) {
       // 本元の発言が確実に先に処理されるよう、ごくわずかに時間をズラす
       setTimeout(() => {
          let chatTab = ObjectStore.instance.get<ChatTab>(this.chatTabidentifier);
          if (chatTab) {
             let msg = new ChatMessage();
             msg.from = 'System';
             msg.to = this.sendTo;
             msg.name = this.character.name;
             msg.tag = 'system';
             msg.value = statusChangeResult; 
             
             // 【大正解の迂回路】専用メソッド「setAttribute」を使って内部データに直接書き込む
             msg.setAttribute('messColor', this.chatColor);
             msg.setAttribute('originFrom', this.myPeer.identifier);
             msg.setAttribute('fixd', 'false'); // XMLの fixd="false" を再現
             
             // 1970年問題も、専用メソッドに時間を渡して解決！
             msg.setAttribute('timestamp', this.chatMessageService.getTime() + 1);
             
             // オブジェクトの初期化
             msg.initialize();

             // addMessageのバグを回避するため、直接ツリーに追加して完了イベントを呼ぶ
             chatTab.appendChild(msg);
             EventSystem.trigger('MESSAGE_ADDED', { tabIdentifier: chatTab.identifier, messageIdentifier: msg.identifier });
          }
       }, 50); 
    }
    // ▲▲▲ 新規追加ここまで ▲▲▲

    this.text = '';
  }
  // sendChat(event: Partial<KeyboardEvent>) {
  //   if (event) event.preventDefault();

  //   if (!this.text.length) return;
  //   if (event && event.keyCode !== 13) return;

  //   if (!this.sendFrom.length) this.sendFrom = this.myPeer.identifier;

    
  //   // ーーーここを変更（colorとposを追加）ーーー
  //   this.chat.emit({ text: this.text, gameType: this.gameType, sendFrom: this.sendFrom, sendTo: this.sendTo, color: this.chatColor, pos: this.tachiePos });
  //   // ーーーここまで変更ーーー
  //   //this.chat.emit({ text: this.text, gameType: this.gameType, sendFrom: this.sendFrom, sendTo: this.sendTo });

  //   this.text = '';
  //   this.previousWritingLength = this.text.length;
  //   let textArea: HTMLTextAreaElement = this.textAreaElementRef.nativeElement;
  //   textArea.value = '';
  //   this.calcFitHeight();
  // }

  calcFitHeight() {
    let textArea: HTMLTextAreaElement = this.textAreaElementRef.nativeElement;
    textArea.style.height = '';
    if (textArea.scrollHeight >= textArea.offsetHeight) {
      textArea.style.height = textArea.scrollHeight + 'px';
    }
  }

  loadDiceBot(gameType: string) {
    console.log('onChangeGameType ready');
    DiceBot.getHelpMessage(gameType).then(help => {
      console.log('onChangeGameType done\n' + help);
    });
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
      textView.text =
        '【ダイスボット】チャットにダイス用の文字を入力するとダイスロールが可能\n'
        + '入力例）２ｄ６＋１　攻撃！\n'
        + '出力例）2d6+1　攻撃！\n'
        + '　　　　  diceBot: (2d6) → 7\n'
        + '上記のようにダイス文字の後ろに空白を入れて発言する事も可能。\n'
        + '以下、使用例\n'
        + '　3D6+1>=9 ：3d6+1で目標値9以上かの判定\n'
        + '　1D100<=50 ：D100で50％目標の下方ロールの例\n'
        + '　3U6[5] ：3d6のダイス目が5以上の場合に振り足しして合計する(上方無限)\n'
        + '　3B6 ：3d6のダイス目をバラバラのまま出力する（合計しない）\n'
        + '　10B6>=4 ：10d6を振り4以上のダイス目の個数を数える\n'
        + '　2R6[>3]>=5 ：2D6のダイス目が3より大きい場合に振り足して、5以上のダイス目の個数を数える\n'
        + '　(8/2)D(4+6)<=(5*3)：個数・ダイス・達成値には四則演算も使用可能\n'
        + '　c(10-4*3/2+2)：c(計算式）で計算だけの実行も可能\n'
        + '　choice[a,b,c]：列挙した要素から一つを選択表示。ランダム攻撃対象決定などに\n'
        + '　S3d6 ： 各コマンドの先頭に「S」を付けると他人結果の見えないシークレットロール\n'
        + '　3d6/2 ： ダイス出目を割り算（端数処理はゲームシステム依存）。切り上げは /2C、四捨五入は /2R、切り捨ては /2F\n'
        + '　D66 ： D66ダイス。順序はゲームに依存。D66N：そのまま、D66A：昇順、D66D：降順\n'
        + '\n'
        + '詳細は下記URLのコマンドガイドを参照\n'
        + 'https://docs.bcdice.org/\n'
        + '===================================\n'
        + this.gameHelp;
    });
  }

  private allowsChat(gameCharacter: GameCharacter): boolean {

// ▼▼▼ 新規追加：「発言をしない」フラグのチェック ▼▼▼
    if (gameCharacter.detailDataElement) {
      let root = gameCharacter.detailDataElement.getFirstElementByName('システム設定');
      if (root) {
        let el = root.getFirstElementByName('disableChat');
        // フラグが true なら発言不可（リストに表示しない）として弾く
        if (el && el.value === 'true') {
          return false; 
        }
      }
    }
    // ▲▲▲ 新規追加ここまで ▲▲▲

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


  // ▼▼▼ 新規追加：ステータス変更コマンドの解析・適用メソッド ▼▼▼
// ▼▼▼ 修正：ステータス変更コマンドの解析・適用メソッド（結果文字列を返すように変更） ▼▼▼
  private applyStatusChanges(text: string, character: GameCharacter): string {
    const regex = /:([^\s:+\-*/=]+)([+\-*/=])([^\s:]+)/g;
    let match;
    let isUpdated = false;
    let results: string[] = []; // 結果を貯める配列

    while ((match = regex.exec(text)) !== null) {
      const attrName = match[1];
      const operator = match[2];
      const valueStr = match[3];

      let targetElm = character.detailDataElement?.getFirstElementByName(attrName) ||
                      character.commonDataElement?.getFirstElementByName(attrName);

      if (targetElm) {
        const isResource = targetElm.type === 'numberResource' || targetElm.currentValue !== undefined;
        const currentVal = isResource ? targetElm.currentValue : targetElm.value;

        const currentNum = Number(currentVal);
        const valNum = Number(valueStr);

        if (!Number.isNaN(currentNum) && !Number.isNaN(valNum)) {
          let newVal = currentNum;
          switch (operator) {
            case '+': newVal += valNum; break;
            case '-': newVal -= valNum; break;
            case '*': newVal *= valNum; break;
            case '/': newVal /= valNum; break;
            case '=': newVal = valNum; break;
          }

          if (isResource) {
            targetElm.currentValue = newVal;
          } else {
            targetElm.value = newVal;
          }
          isUpdated = true;
          // 結果テキストを作成（例: HP:200+5>205）
          results.push(`${attrName}:${currentNum}${operator}${valNum}>${newVal}`);
        } 
        else if (operator === '=') {
          if (isResource) {
            targetElm.currentValue = valueStr;
          } else {
            targetElm.value = valueStr;
          }
          isUpdated = true;
          // 文字列の代入結果（例: メモ:通常>睡眠中）
          results.push(`${attrName}:${currentVal}>${valueStr}`);
        }
      }
    }

    if (isUpdated) {
      character.update();
    }
    
    // 複数の結果がある場合はスペース2つで区切って1つの文字列にする
    return results.join('  ');
  }
  // ▲▲▲ 修正ここまで ▲▲▲
}