import { AfterViewInit, Component, OnDestroy, OnInit } from '@angular/core';
import { ChatMessage } from '@udonarium/chat-message';
import { ChatTab } from '@udonarium/chat-tab';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';
import { EventSystem } from '@udonarium/core/system';
import { PeerCursor } from '@udonarium/peer-cursor';
import { ChatTabSettingComponent } from 'component/chat-tab-setting/chat-tab-setting.component';
import { ChatMessageService } from 'service/chat-message.service';
import { PanelOption, PanelService } from 'service/panel.service';
import { PointerDeviceService } from 'service/pointer-device.service';

import { Subscription } from 'rxjs';
import { ChatSettingsService } from '../../service/chat-settings.service';

@Component({
  selector: 'chat-window',
  templateUrl: './chat-window.component.html',
  styleUrls: ['./chat-window.component.css']
})
export class ChatWindowComponent implements OnInit, OnDestroy, AfterViewInit {
  sendFrom: string = 'Guest';

  get gameType(): string { return !this.chatMessageService.gameType ? 'DiceBot' : this.chatMessageService.gameType; }
  set gameType(gameType: string) { this.chatMessageService.gameType = gameType; }

  private _chatTabidentifier: string = '';
  get chatTabidentifier(): string { return this._chatTabidentifier; }
  set chatTabidentifier(chatTabidentifier: string) {
    let hasChanged: boolean = this._chatTabidentifier !== chatTabidentifier;
    this._chatTabidentifier = chatTabidentifier;
    this.updatePanelTitle();
    if (hasChanged) {
      this.scrollToBottom(true);
    }
  }

  // START: リリィ準拠 タブの左右切り替え
  chatTabSwitchRelative(direction: number) {
    let chatTabs = this.chatMessageService.chatTabs;
    let index = chatTabs.findIndex((elm) => elm.identifier == this.chatTabidentifier);
    if (index < 0) { return; }

    let nextIndex: number;
    if (index == chatTabs.length - 1 && direction == 1) {
      nextIndex = 0;
    } else if (index == 0 && direction == -1) {
      nextIndex = chatTabs.length - 1;
    } else {
      nextIndex = index + direction;
    }
    this.chatTabidentifier = chatTabs[nextIndex].identifier;
  }
  // END

  get chatTab(): ChatTab { return ObjectStore.instance.get<ChatTab>(this.chatTabidentifier); }
  isAutoScroll: boolean = true;
  scrollToBottomTimer: NodeJS.Timeout = null;

  private settingsSub: Subscription;

  constructor(
    public chatMessageService: ChatMessageService,
    private panelService: PanelService,
    private pointerDeviceService: PointerDeviceService,
    public chatSettingsService: ChatSettingsService
  ) { }

  ngOnInit() {
    this.sendFrom = PeerCursor.myCursor.identifier;
    this._chatTabidentifier = 0 < this.chatMessageService.chatTabs.length ? this.chatMessageService.chatTabs[0].identifier : '';

    EventSystem.register(this)
      .on('MESSAGE_ADDED', event => {
        if (event.data.tabIdentifier !== this.chatTabidentifier) return;
        let message = ObjectStore.instance.get<ChatMessage>(event.data.messageIdentifier);
        if (message && message.isSendFromSelf) {
          this.isAutoScroll = true;
        } else {
          this.checkAutoScroll();
        }
        if (this.isAutoScroll && this.chatTab) this.chatTab.markForRead();
      });
    Promise.resolve().then(() => this.updatePanelTitle());

    // 設定変更時のスクロール処理（強引なscrollByを廃止し、正規の関数を呼ぶだけにする）
    this.settingsSub = this.chatSettingsService.settingsChanged.subscribe(() => {
      setTimeout(() => {
        this.scrollToBottom(true);
      }, 50);
    });
  }

  ngAfterViewInit() {
    queueMicrotask(() => this.scrollToBottom(true));
  }

  ngOnDestroy() {
    EventSystem.unregister(this);
    if (this.settingsSub) {
      this.settingsSub.unsubscribe();
    }
  }

  // START: リリィ準拠 スクロール制御
  scrollToBottom(isForce: boolean = false) {
    if (isForce) this.isAutoScroll = true;
    if (!this.isAutoScroll) return;
    let event = new CustomEvent('scrolltobottom', {});
    this.panelService.scrollablePanel.dispatchEvent(event);
    if (this.scrollToBottomTimer != null) return;
    this.scrollToBottomTimer = setTimeout(() => {
      if (this.chatTab) this.chatTab.markForRead();
      this.scrollToBottomTimer = null;
      this.isAutoScroll = false;
      if (this.panelService.scrollablePanel) {
        this.panelService.scrollablePanel.scrollTop = this.panelService.scrollablePanel.scrollHeight;
      }
    }, 0);
  }

  checkAutoScroll() {
    if (!this.panelService.scrollablePanel) return;
    let top = this.panelService.scrollablePanel.scrollHeight - this.panelService.scrollablePanel.clientHeight;
    if (top - 150 <= this.panelService.scrollablePanel.scrollTop) {
      this.isAutoScroll = true;
    } else {
      this.isAutoScroll = false;
    }
  }
  // END

  updatePanelTitle() {
    if (this.chatTab) {
      this.panelService.title = 'チャットウィンドウ - ' + this.chatTab.name;
    } else {
      this.panelService.title = 'チャットウィンドウ';
    }
  }

  onSelectedTab(identifier: string) {
    this.updatePanelTitle();
  }

  showTabSetting() {
    let coordinate = this.pointerDeviceService.pointers[0];
    let option: PanelOption = { left: coordinate.x - 250, top: coordinate.y - 175, width: 500, height: 380 }; // サイズをリリィに合わせる
    let component = this.panelService.open<ChatTabSettingComponent>(ChatTabSettingComponent, option);
    component.selectedTab = this.chatTab;
  }

  // 現在のプロジェクト仕様に合わせた sendChat
  sendChat(value: { text: string, gameType: string, sendFrom: string, sendTo: string, color: string, tachieId: string }) {
    if (this.chatTab) {
      this.chatMessageService.sendMessage(this.chatTab, value.text, value.gameType, value.sendFrom, value.sendTo, value.color, value.tachieId);
    }
  }

  trackByChatTab(index: number, chatTab: ChatTab) {
    return chatTab.identifier;
  }
}