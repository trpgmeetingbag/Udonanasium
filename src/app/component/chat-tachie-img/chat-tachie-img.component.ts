import { Component, ElementRef, ChangeDetectorRef, EventEmitter, Input, NgZone,
         OnDestroy, OnInit, AfterViewInit, AfterViewChecked, Output, ViewChild } from '@angular/core';

import { ChatMessage } from '@udonarium/chat-message';
import { ChatTab } from '@udonarium/chat-tab';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';
import { EventSystem } from '@udonarium/core/system';
import { PeerCursor } from '@udonarium/peer-cursor';
import { ChatMessageService } from 'service/chat-message.service';
import { PanelOption, PanelService } from 'service/panel.service';
import { PointerDeviceService } from 'service/pointer-device.service';
import { ChatSettingsService } from 'service/chat-settings.service'; // ★追加: 独自の設定サービスをインポート

import { ImageFile } from '@udonarium/core/file-storage/image-file';
import { ImageStorage } from '@udonarium/core/file-storage/image-storage';

import { ChatTabList } from '@udonarium/chat-tab-list';

@Component({
  selector: 'chat-tachie-img',
  templateUrl: './chat-tachie-img.component.html',
  styleUrls: ['./chat-tachie-img.component.css']
})
export class ChatTachieImageComponent implements OnInit, OnDestroy, AfterViewInit, AfterViewChecked {

  @Input() chatTabidentifier: string = '';
  @Input() isTilteTop = false;
  @Input() dispByMouse = false;

  @ViewChild('tachieArea', { read: ElementRef }) private tachieArea: ElementRef;  
  private _tachieAreaWidth = 0;
  
  get chatTab(): ChatTab { return ObjectStore.instance.get<ChatTab>(this.chatTabidentifier); }
  get chatTabList(): ChatTabList { return ObjectStore.instance.get<ChatTabList>('ChatTabList'); }

  // =========================================================
  // 【修正点】設定値の取得先を ChatSettingsService に変更
  // =========================================================
  
  // ▼ 追加：独自管理されている表示ON/OFFフラグを取得するゲッター
  get isTachieDispFlagOn(): boolean {
    if (this.chatSettingsService && this.chatSettingsService.tachieDispMap) {
      const flag = this.chatSettingsService.tachieDispMap[this.chatTabidentifier];
      if (flag !== undefined) return flag;
    }
    return true; // 未設定の場合は初期値として表示(true)とする
  }

  get isTachieInWindow(): boolean {
    return false;
  }
  
  get tachieHeightValue(): number {
    // ▼ 修正：独自サービス（chatSettingsService）からサイズ設定を読み取る
    if (this.chatSettingsService && this.chatSettingsService.tachieHeightValue !== undefined) {
       return this.chatSettingsService.tachieHeightValue;
    }
    return 250;
  }
  
  get isKeepTachieOutWindow(): boolean {
    return true; 
  }
  
  get isTachieDispMode() {
    return true; 
  }

  get tachieY_Pos(): number { 
    return - this.tachieHeightValue - 26;
  }

  get tachieAreaWidth(): number { 
    return this._tachieAreaWidth;
  }
  
  tachieAreaHeight(pos: number): number {
    if (this.chatTab) {
      // ▼ 修正：先ほど作成した独自管理の表示フラグを参照する
      if (this.isTachieDispFlagOn) {
        if (typeof (this.chatTab as any).tachiePosIsDisp === 'function') {
          if ((this.chatTab as any).tachiePosIsDisp(pos)) return this.tachieHeightValue;
        } else {
          let id = this.chatTab.imageIdentifier ? this.chatTab.imageIdentifier[pos] : ' ';
          if (id && id.trim() !== '') return this.tachieHeightValue;
        }
      }
    }
    return 0;
  }
  
  get tachieAreaHeight00(): number { return this.tachieAreaHeight(0); }
  get tachieAreaHeight01(): number { return this.tachieAreaHeight(1); }
  get tachieAreaHeight02(): number { return this.tachieAreaHeight(2); }
  get tachieAreaHeight03(): number { return this.tachieAreaHeight(3); }
  get tachieAreaHeight04(): number { return this.tachieAreaHeight(4); }
  get tachieAreaHeight05(): number { return this.tachieAreaHeight(5); }
  get tachieAreaHeight06(): number { return this.tachieAreaHeight(6); }
  get tachieAreaHeight07(): number { return this.tachieAreaHeight(7); }
  get tachieAreaHeight08(): number { return this.tachieAreaHeight(8); }
  get tachieAreaHeight09(): number { return this.tachieAreaHeight(9); }
  get tachieAreaHeight10(): number { return this.tachieAreaHeight(10); }
  get tachieAreaHeight11(): number { return this.tachieAreaHeight(11); }
  
  ngAfterViewInit() {
    if (this.tachieArea) {
      this._tachieAreaWidth = this.tachieArea.nativeElement.offsetWidth;
      this.changeDetectionRef.detectChanges();
    }
  }  

  ngAfterViewChecked() {
    if (this.tachieArea) {
      this._tachieAreaWidth = this.tachieArea.nativeElement.offsetWidth;
      this.changeDetectionRef.detectChanges();
    }
  }  

  private _zindexOffset = 10;

  getZIndexSafe(pos: number): number {
    if (this.chatTab && typeof (this.chatTab as any).tachieZindex === 'function') {
      return (this.chatTab as any).tachieZindex(pos) + this._zindexOffset;
    }
    return pos + this._zindexOffset;
  }

  get zIndex_00(): number { return this.getZIndexSafe(0); }
  get zIndex_01(): number { return this.getZIndexSafe(1); }
  get zIndex_02(): number { return this.getZIndexSafe(2); }
  get zIndex_03(): number { return this.getZIndexSafe(3); }
  get zIndex_04(): number { return this.getZIndexSafe(4); }
  get zIndex_05(): number { return this.getZIndexSafe(5); }
  get zIndex_06(): number { return this.getZIndexSafe(6); }
  get zIndex_07(): number { return this.getZIndexSafe(7); }
  get zIndex_08(): number { return this.getZIndexSafe(8); }
  get zIndex_09(): number { return this.getZIndexSafe(9); }
  get zIndex_10(): number { return this.getZIndexSafe(10); }
  get zIndex_11(): number { return this.getZIndexSafe(11); }

  private _opacity = 0.66;

  getOpacitySafe(pos: number): number {
    if (this.chatTab && typeof (this.chatTab as any).tachieZindex === 'function') {
      if ((this.chatTab as any).tachieZindex(pos) == 11) return 1;
    }
    return this._opacity;
  }

  get opacity_00(): number { return this.getOpacitySafe(0); }
  get opacity_01(): number { return this.getOpacitySafe(1); }
  get opacity_02(): number { return this.getOpacitySafe(2); }
  get opacity_03(): number { return this.getOpacitySafe(3); }
  get opacity_04(): number { return this.getOpacitySafe(4); }
  get opacity_05(): number { return this.getOpacitySafe(5); }
  get opacity_06(): number { return this.getOpacitySafe(6); }
  get opacity_07(): number { return this.getOpacitySafe(7); }
  get opacity_08(): number { return this.getOpacitySafe(8); }
  get opacity_09(): number { return this.getOpacitySafe(9); }
  get opacity_10(): number { return this.getOpacitySafe(10); }
  get opacity_11(): number { return this.getOpacitySafe(11); }

  get imageFileUrl_00(): string { return this.getImageUrl(0); }
  get imageFileUrl_01(): string { return this.getImageUrl(1); }
  get imageFileUrl_02(): string { return this.getImageUrl(2); }
  get imageFileUrl_03(): string { return this.getImageUrl(3); }
  get imageFileUrl_04(): string { return this.getImageUrl(4); }
  get imageFileUrl_05(): string { return this.getImageUrl(5); }
  get imageFileUrl_06(): string { return this.getImageUrl(6); }
  get imageFileUrl_07(): string { return this.getImageUrl(7); }
  get imageFileUrl_08(): string { return this.getImageUrl(8); }
  get imageFileUrl_09(): string { return this.getImageUrl(9); }
  get imageFileUrl_10(): string { return this.getImageUrl(10); }
  get imageFileUrl_11(): string { return this.getImageUrl(11); }

  private getImageUrl(pos: number): string {
    if (!this.chatTab || !this.chatTab.imageIdentifier) return '';
    let identifier = this.chatTab.imageIdentifier[pos];
    if (!identifier || identifier.trim() === '') return '';
    let image: ImageFile = ImageStorage.instance.get(identifier);
    if (image) return image.url;
    return '';
  }

  tachieClick(pos: number) {
    if (typeof (this.chatTab as any).tachiePosHide === 'function') {
      this.chatTab.tachiePosHide(pos);
    }
  }

  constructor(
    public chatMessageService: ChatMessageService,
    private changeDetectionRef: ChangeDetectorRef,
    private panelService: PanelService,
    private pointerDeviceService: PointerDeviceService,
    public chatSettingsService: ChatSettingsService // ★追加: コンストラクタでサービスを受け取る
  ) { }

  ngOnInit() {
  }

  ngOnDestroy() {
    EventSystem.unregister(this);
  }

  trackByChatTab(index: number, chatTab: ChatTab) {
    return chatTab.identifier;
  }
}