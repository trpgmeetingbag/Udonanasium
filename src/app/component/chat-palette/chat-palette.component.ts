import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChatPalette } from '@udonarium/chat-palette';
import { ChatTab } from '@udonarium/chat-tab';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';
import { EventSystem } from '@udonarium/core/system';
import { DiceBot } from '@udonarium/dice-bot';
import { GameCharacter } from '@udonarium/game-character';
import { PeerCursor } from '@udonarium/peer-cursor';
import { ChatInputComponent } from 'component/chat-input/chat-input.component';
import { ChatMessageService } from 'service/chat-message.service';
import { PanelService } from 'service/panel.service';

import { HostListener } from '@angular/core';

import { ContextMenuService } from 'service/context-menu.service';
import { PointerDeviceService } from 'service/pointer-device.service';
import { PaletteIndex } from '@udonarium/chat-palette';



@Component({
  selector: 'chat-palette',
  templateUrl: './chat-palette.component.html',
  styleUrls: ['./chat-palette.component.css']
})
export class ChatPaletteComponent implements OnInit, OnDestroy {
   @ViewChild('root', { static: true }) rootElementRef: ElementRef<HTMLElement>;
  @ViewChild('chatInput', { static: true }) chatInputComponent: ChatInputComponent;
  @ViewChild('chatPlette') chatPletteElementRef: ElementRef<HTMLSelectElement>;
  @Input() character: GameCharacter = null;

  get palette(): ChatPalette { return this.character.chatPalette; }

  private _gameType: string = '';
  get gameType(): string { return !this._gameType ? 'DiceBot' : this._gameType; };
  set gameType(gameType: string) {
    this._gameType = gameType;
    if (this.character.chatPalette) this.character.chatPalette.dicebot = gameType;
  };

  get sendFrom(): string { return this.character.identifier; }
  set sendFrom(sendFrom: string) {
    this.onSelectedCharacter(sendFrom);
  }

  chatTabidentifier: string = '';
  text: string = '';
  sendTo: string = '';

  isEdit: boolean = false;
  editPalette: string = '';

  /* private */ _timeId: string = '';

  private doubleClickTimer: NodeJS.Timeout = null;

  private _paletteIndex: PaletteIndex[] = [];

  get diceBotInfos() { return DiceBot.diceBotInfos }

  get chatTab(): ChatTab { return ObjectStore.instance.get<ChatTab>(this.chatTabidentifier); }
  get myPeer(): PeerCursor { return PeerCursor.myCursor; }
  get otherPeers(): PeerCursor[] { return ObjectStore.instance.getObjects(PeerCursor); }

  constructor(
    public chatMessageService: ChatMessageService,
    private panelService: PanelService,
    private pointerDeviceService: PointerDeviceService,
    private contextMenuService: ContextMenuService
  ) { }

  ngOnInit() {
    Promise.resolve().then(() => this.updatePanelTitle());

// ▼▼▼ 新規追加：内部のチャット入力コンポーネントにパレットモードであることを通知 ▼▼▼
    if (this.chatInputComponent) {
      this.chatInputComponent.isPaletteMode = true;
    }
    // ▲▲▲ 新規追加ここまで ▲▲▲
    this._timeId = Date.now() + '_chat-palette';

    this.chatTabidentifier = this.chatMessageService.chatTabs ? this.chatMessageService.chatTabs[0].identifier : '';
    this.gameType = this.character.chatPalette ? this.character.chatPalette.dicebot : '';
    EventSystem.register(this)
      .on('DELETE_GAME_OBJECT', event => {
        if (this.character && this.character.identifier === event.data.identifier) {
          this.panelService.close();
        }
        if (this.chatTabidentifier === event.data.identifier) {
          this.chatTabidentifier = this.chatMessageService.chatTabs ? this.chatMessageService.chatTabs[0].identifier : '';
        }
      });
  }

  ngOnDestroy() {
    EventSystem.unregister(this);
    if (this.isEdit) this.toggleEditMode();
  }

  updatePanelTitle() {
    this.panelService.title = this.character.name + ' のチャットパレット';
  }

  onSelectedCharacter(identifier: string) {
    if (this.isEdit) this.toggleEditMode();
    let object = ObjectStore.instance.get(identifier);
    if (object instanceof GameCharacter) {
      this.character = object;
      let gameType = this.character.chatPalette ? this.character.chatPalette.dicebot : '';
      if (0 < gameType.length) this.gameType = gameType;
    }
    this.updatePanelTitle();
  }

// selectPalette(line: string) {
//     // ▼ 修正: \n を実際の改行に変換する
//     this.text = line.replace(/\\n/g, '\n');
//   }

  clickPalette(line: string) {
    // ▼ 修正: \n を実際の改行に変換した文字をベースに判定を行う
    let multiLine = line.replace(/\\n/g, '\n');
    
    if (this.doubleClickTimer && this.text === multiLine) {
      clearTimeout(this.doubleClickTimer);
      this.doubleClickTimer = null;
      this.chatInputComponent.sendChat(null);
    } else {
      this.text = multiLine;
      this.doubleClickTimer = setTimeout(() => { this.doubleClickTimer = null }, 400);
    }
  }

// --- START: チャットパレットからの送信に色と立ち絵ID（tachieId）を含める修正 ---
  sendChat(value: { text: string, gameType: string, sendFrom: string, sendTo: string, color: string, tachieId: string }) {
    if (this.chatTab) {
      let text = this.palette.evaluate(value.text, this.character.rootDataElement);
      // 受け取った color と tachieId を sendMessage の引数として末尾に追加してリレーする
      this.chatMessageService.sendMessage(this.chatTab, text, value.gameType, value.sendFrom, value.sendTo, value.color, value.tachieId);
    }
  }
// --- END ---

  resetPletteSelect() {
    if (!this.chatPletteElementRef.nativeElement) return;
    this.chatPletteElementRef.nativeElement.selectedIndex = -1;
  }

  toggleEditMode() {
    this.isEdit = this.isEdit ? false : true;
    if (this.isEdit) {
      this.editPalette = this.palette.value + '';
    } else {
      this.palette.setPalette(this.editPalette);
    }
  }


  // Ctrl + 左右キーの入力を監視
  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (event.ctrlKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      this.chatTabSwitchRelative(direction);
    }
  }

  // ▼▼ リリィ版から移植した純正のタブ切り替えロジック ▼▼
  chatTabSwitchRelative(direction: number) {
    // ChatMessageService が持っているチャットタブのリストを利用する
    let chatTabs = this.chatMessageService.chatTabs;
    if (!chatTabs || chatTabs.length === 0) return;

    // 現在選択されているタブが、リストの何番目にあるかを探す
    let index = chatTabs.findIndex((elm) => elm.identifier == this.chatTabidentifier);
    if (index < 0) { return; }

    // 次のインデックスを計算し、端ならループさせる
    let nextIndex: number;
    if (index == chatTabs.length - 1 && direction == 1) {
      nextIndex = 0;
    } else if (index == 0 && direction == -1) {
      nextIndex = chatTabs.length - 1;
    } else {
      nextIndex = index + direction;
    }
    
    // パレットの送信先タブ識別子を更新する
    this.chatTabidentifier = chatTabs[nextIndex].identifier;
  }


    autoCompleteSwitchRelative(direction: number){
    console.log('selectAutoComplete :' + direction);
    const selectObj = <HTMLSelectElement>document.getElementById( this._timeId + '_complete');
    if (!selectObj ){
      return;
    }

    const optionNum = selectObj.length;
    let newIndex = selectObj.selectedIndex;
    newIndex += direction;
    if( newIndex <= -1){
      return;
    }
    if( newIndex >= optionNum){
      newIndex = optionNum - 1;
    }
    selectObj.selectedIndex = newIndex;
  }

  autoCompleteDoRelative(index: number){
    const selectObj = <HTMLSelectElement>document.getElementById( this._timeId + '_complete');
    if( index != selectObj.selectedIndex) return;
    this.selectAutoComplete(this.text, selectObj.value);
  }

  selectPalette(line: string) {
    let multiLine = line.replace(/\\n/g, '\n');
    this.text = multiLine;
    const selectObj = <HTMLSelectElement>document.getElementById( this._timeId + '_complete');
    if (selectObj){
      selectObj.selectedIndex = -1;
    }
  }

  selectAutoComplete(text,selectText){
    const selectObj = <HTMLSelectElement>document.getElementById( this._timeId + '_complete');
    let lineNo = this.palette.paletteMatchLine(text, selectObj.selectedIndex);
    console.log(text + ' ' + selectText + ' index:' + selectObj.selectedIndex + ' lineNo' +lineNo);
    this.japmIndex(lineNo);
    this.selectPalette(selectText);
  }

  completeIndex(): number{
    let select = <HTMLSelectElement> document.getElementById(this._timeId + '_complete');
    if (select){
      return select.selectedIndex;
    }
    return -1;
  }

  autoCompleteList(): string[]{
    let paletteMatch : string[] = new Array();
    if( this.text.length > 1){
      paletteMatch = this.palette.paletteMatch(this.text);
    }
    return paletteMatch;
  }

    japmIndex(lineNo: number) {
    console.log('JUMP_INDEX:' + lineNo);
    let select = <HTMLSelectElement> document.getElementById(this._timeId + '_select');
    if (select){
      select.scrollTop = select.scrollHeight;
      select.options[lineNo].selected = false;
      select.options[lineNo].selected = true;
    }
  }
  
  
// indexBtn() {
//     let panel: HTMLElement = this.rootElementRef.nativeElement;
//     let panelBox = panel.getBoundingClientRect();

//     // メニューの想定幅（約140px）分だけ、パネルの左端からさらに左へズラす
//     let offsetX = 118; 
    
//     let position = {
//       x: panelBox.left - offsetX,
//       y: panelBox.top - 8  // Y座標はパネルの上端とピッタリ合わせる
//     };

//     this._paletteIndex = this.palette.paletteIndex;

//     let index = new Array();
//     for (let list of this._paletteIndex){
//       // Vanilla環境向けのアクション指定
//       index.push({ 
//         name: list.name, 
//         action: () => { this.japmIndex(list.line); } 
//       });
//     }
//     // 要素が0個だった場合は、案内用のダミー項目を追加する
//     if (index.length === 0) {
//       index.push({
//         name: '見出しがありません',
//         action: () => {} // クリックしても何もしない
//       });
//     }

//     if (index.length > 0) {
//       this.contextMenuService.open(position, index, 'インデックス');
//     }
//   }

// indexBtn() {
//     let panel: HTMLElement = this.rootElementRef.nativeElement;
//     let panelBox = panel.getBoundingClientRect();

//     this._paletteIndex = this.palette.paletteIndex;
//     let index = new Array();

//     // ▼▼ 自動計算用の変数 ▼▼
//     let maxLen = 0; // デフォルト幅（「見出しがありません」の全角9文字分）

//     for (let list of this._paletteIndex){
//       // 1. 各見出しの長さを計算（半角は0.5文字、全角は1文字としてカウント）
//       let len = 0;
//       for (let i = 0; i < list.name.length; i++) {
//         len += (list.name[i].match(/[ -~]/)) ? 0.5 : 1;
//       }
//       // 2. 最大文字数を更新
//       if (len > maxLen) {
//         maxLen = len;
//       }

//       index.push({ 
//         name: list.name, 
//         action: () => { this.japmIndex(list.line); } 
//       });
//     }

//     if (index.length === 0) {
//       index.push({
//         name: '見出しがありません',
//         action: () => {} 
//       });
//     maxLen = 7; // デフォルト幅（「見出しがありません」の全角9文字分）
//     }

//     // ▼▼ 動的なズレ幅の計算 ▼▼
//     // 全角1文字を約16pxとして計算 ＋ メニューの左右余白（約40px）
//     let estimatedWidth = Math.ceil(maxLen) * 7.1 + 40;
    
//     // ※長すぎる見出しがあった場合に画面外へ消し飛ばないためのストッパー（最大400px）
//     if (estimatedWidth > 400) estimatedWidth = 400;

//     // Vanilla向け安全対策付き座標セット
//     let position = this.pointerDeviceService.pointers[0] || { x: 0, y: 0 };
    
//     // 計算した幅の分だけ、パネルの左端からマイナス（左へ移動）する！
//     position.x = panelBox.left - estimatedWidth -117;
//     position.y = panelBox.top - 8.4;

//     this.contextMenuService.open(position, index, 'インデックス');
//   }

  indexBtn() {
    let panel: HTMLElement = this.rootElementRef.nativeElement;
    let panelBox = panel.getBoundingClientRect();

    let position = this.pointerDeviceService.pointers[0];
    console.log(this.panelService.left + ' ' + this.panelService.top);
    position.x = panelBox.left - 8;
    position.y = panelBox.top - 8;

    this._paletteIndex = this.palette.paletteIndex;

    let index = new Array();
    let count = 0;
    for (let list of this._paletteIndex){
      index.push({ name: list.name , line: list.line , id: this._timeId  , action: () => {} }); // ここでのactionはダミー、実行されない

      count++;
    }

    this.contextMenuService.open(position, index ,'インデックス' );
  }

}
