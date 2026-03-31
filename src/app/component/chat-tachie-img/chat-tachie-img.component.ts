import { Component, Input, ElementRef, AfterViewInit, OnDestroy, ViewChild } from '@angular/core';
import { ChatTab } from '@udonarium/chat-tab';
import { ChatTabList } from '@udonarium/chat-tab-list';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';
import { ImageStorage } from '@udonarium/core/file-storage/image-storage';

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

  constructor(private elementRef: ElementRef) {}

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
  tachieClick(pos: number) {
    if (this.chatTab) {
      this.chatTab.tachiePosHide(pos);
    }
  }
}