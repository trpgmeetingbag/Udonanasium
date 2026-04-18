import { Component, Input, ElementRef, AfterViewInit, OnDestroy, ViewChild } from '@angular/core';
import { ChatTab } from '@udonarium/chat-tab';
import { ChatTabList } from '@udonarium/chat-tab-list';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';
import { ImageStorage } from '@udonarium/core/file-storage/image-storage';
// === ↓ 追加 ↓ ===
import { ChatSettingsService } from 'service/chat-settings.service';
// === ↑ 追加 ↑ ===

@Component({
  selector: 'chat-tachie-img',
  templateUrl: './chat-tachie-img.component.html',
  styleUrls: ['./chat-tachie-img.component.css']
})
export class ChatTachieImageComponent implements AfterViewInit, OnDestroy {
  @Input() chatTabidentifier: string = '';
  
  // HTML側で作るお引越し用のレイヤーを捕まえます
  @ViewChild('tachieLayer', { static: true }) layerRef: ElementRef;
  posArray: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  constructor(
    private elementRef: ElementRef,
    public chatSettingsService: ChatSettingsService // ← これを追加
  ) {}

  // 画面描画後、真のギロチン（scrollable-panel）から脱出し、大枠（draggable-panel）の直下へお引越しします
  ngAfterViewInit() {
    setTimeout(() => {
      const panel = this.elementRef.nativeElement.closest('.draggable-panel');
      if (panel && this.layerRef) {
        panel.appendChild(this.layerRef.nativeElement);
      }
    }, 100);
  }

  // ウィンドウが閉じた時は、お引越し先からレイヤーを綺麗にお掃除します
  ngOnDestroy() {
    if (this.layerRef && this.layerRef.nativeElement.parentElement) {
      this.layerRef.nativeElement.parentElement.removeChild(this.layerRef.nativeElement);
    }
  }

  get chatTab(): ChatTab {
    return ObjectStore.instance.get<ChatTab>(this.chatTabidentifier);
  }

  get chatTabList(): ChatTabList {
    return ChatTabList.instance;
  }

  // === ↓ ここから追加 ↓ ===
  // 個人の表示フラグをサービスから取得
  get tachieDispFlag(): boolean {
    if (this.chatSettingsService.tachieDispMap[this.chatTabidentifier] === undefined) {
      return true; // 初期状態は表示
    }
    return this.chatSettingsService.tachieDispMap[this.chatTabidentifier];
  }

  // 個人のサイズ設定をサービスから取得
  get tachieHeightValue(): number {
    return this.chatSettingsService.tachieHeightValue;
  }
  // === ↑ ここまで追加 ↑ ===

  // --- START: アクティブな立ち絵POSの取得ロジック ---
  // 現在アクティブ（不透明）にすべきPOS番号を取得します。誰も発言していない初期状態などは -1 を返します。
  get activePos(): number {
    if (!this.chatTab) return -1;
    const posStr = this.chatTab.getAttribute('activeTachiePos');
    return posStr ? parseInt(posStr, 10) : -1;
  }
  // --- END ---

  
  // 指定されたPOSの画像URLを取得
  getImageUrl(pos: number): string {
    if (!this.chatTab || !this.chatTab.imageIdentifier) return '';
    let identifier = this.chatTab.imageIdentifier[pos];
    if (!identifier || identifier === ' ') return '';
    let image = ImageStorage.instance.get(identifier);
    return image ? image.url : '';
  }

  // --- START: 立ち絵の等間隔配置と両端の調整 ---
  getLeftStyle(pos: number): string {
    return `${(pos / 11) * 100}%`;
  }

  getTransformStyle(pos: number): string {
    // posが0の時は左端(0%)、11の時は右端(-100%)へスライドさせ、枠外へのはみ出しを防ぐ
    const shift = (pos / 11) * -100;
    return `translateX(${shift}%)`;
  }
// --- END ---

  // 画像クリックでそのPOSの立ち絵を消す
  // tachieClick(pos: number) {
  //   if (this.chatTab) {
  //     this.chatTab.tachiePosHide(pos);
  //   }
  // }

  // === ↓ 修正・追加箇所 ↓ ===

  // 1. 指定した位置が「自分だけ」非表示に設定されているか確認するゲッター
  isPosHidden(pos: number): boolean {
    const hiddenArray = this.chatSettingsService.tachieHiddenPosMap[this.chatTabidentifier];
    return hiddenArray ? !!hiddenArray[pos] : false;
  }

  // 2. 画像クリック時の処理を書き換え
  tachieClick(pos: number) {
    // 共有データの chatTab.tachiePosHide(pos) は呼ばない（同期を防ぐ）
    
    // 自分のローカル設定を更新する
    if (!this.chatSettingsService.tachieHiddenPosMap[this.chatTabidentifier]) {
      // まだデータがない場合は、12ポジション分(false)の配列を作成
      this.chatSettingsService.tachieHiddenPosMap[this.chatTabidentifier] = new Array(12).fill(false);
    }
    
    // 現在の状態を反転させる（クリックするたびに 消える <-> 出る を切り替え可能にする）
    const currentState = this.isPosHidden(pos);
    this.chatSettingsService.tachieHiddenPosMap[this.chatTabidentifier][pos] = !currentState;
  }

  // (※もし以前の実装で getImageUrl 内で chatTab の非表示状態を参照していた場合は、
  // そこも pure な画像取得だけに留めるようにします)
  // === ↑ 修正・追加箇所ここまで ↑ ===
}