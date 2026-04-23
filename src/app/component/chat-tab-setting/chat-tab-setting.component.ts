import { Component, OnDestroy, OnInit } from '@angular/core';

import { ChatTab } from '@udonarium/chat-tab';
import { ChatTabList } from '@udonarium/chat-tab-list';
import { ObjectSerializer } from '@udonarium/core/synchronize-object/object-serializer';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';
import { EventSystem } from '@udonarium/core/system';

import { ChatMessageService } from 'service/chat-message.service';
import { ModalService } from 'service/modal.service';
import { PanelService } from 'service/panel.service';
import { SaveDataService } from 'service/save-data.service';

import { Network } from '@udonarium/core/system';

@Component({
  selector: 'app-chat-tab-setting',
  templateUrl: './chat-tab-setting.component.html',
  styleUrls: ['./chat-tab-setting.component.css']
})
export class ChatTabSettingComponent implements OnInit, OnDestroy {
  selectedTab: ChatTab = null;
  selectedTabXml: string = '';

  get tabName(): string { return this.selectedTab.name; }
  set tabName(tabName: string) { if (this.isEditable) this.selectedTab.name = tabName; }
// --- START: 前回の isSystemNoticeTarget を削除し、以下に書き換え ---
  
  // 現在のシステム通知先タブ名を取得（何も設定されていなければ一番上[0]のタブ名）
  get systemNoticeTargetName(): string {
    if (this.chatTabs.length === 0) return 'なし';
    const targetTab = this.chatTabs.find(tab => tab.getAttribute('systemNoticeTarget') === 'true');
    return targetTab ? targetTab.name : this.chatTabs[0].name;
  }

  // 選択中のタブをシステム通知先に指定する（排他制御）
  setSystemNoticeTarget() {
    if (!this.selectedTab || !this.isEditable) return;
    
    // 一度すべてのタブのフラグを解除する
    this.chatTabs.forEach(tab => {
      tab.setAttribute('systemNoticeTarget', 'false');
    });
    
    // 現在選択中のタブにのみフラグを立てる
    this.selectedTab.setAttribute('systemNoticeTarget', 'true');
  }
  
  // --- END ---

  get chatTabs(): ChatTab[] { return this.chatMessageService.chatTabs; }
  get isEmpty(): boolean { return this.chatMessageService.chatTabs.length < 1 }
  get isDeleted(): boolean { return this.selectedTab ? ObjectStore.instance.get(this.selectedTab.identifier) == null : false; }
  get isEditable(): boolean { return !this.isEmpty && !this.isDeleted; }

  isSaveing: boolean = false;
  progresPercent: number = 0;
  modeCocLog = false; // にわとりさん風(CoC)形式フラグ

  constructor(
    private modalService: ModalService,
    private panelService: PanelService,
    private chatMessageService: ChatMessageService,
    private saveDataService: SaveDataService
  ) { }

  ngOnInit() {
    Promise.resolve().then(() => this.modalService.title = this.panelService.title = 'チャットタブ設定');
    EventSystem.register(this)
      .on('DELETE_GAME_OBJECT', 2000, event => {
        if (!this.selectedTab || event.data.identifier !== this.selectedTab.identifier) return;
        let object = ObjectStore.instance.get(event.data.identifier);
        if (object !== null) {
          this.selectedTabXml = object.toXml();
        }
      });
  }

  ngOnDestroy() {
    EventSystem.unregister(this);
  }

  onChangeSelectTab(identifier: string) {
    this.selectedTab = ObjectStore.instance.get<ChatTab>(identifier);
    this.selectedTabXml = '';
  }

  create() {
    ChatTabList.instance.addChatTab('タブ');
  }

  async save() {
    if (!this.selectedTab || this.isSaveing) return;
    this.isSaveing = true;
    this.progresPercent = 0;

    let fileName: string = 'chat_' + this.selectedTab.name;

    await this.saveDataService.saveGameObjectAsync(this.selectedTab, fileName, percent => {
      this.progresPercent = percent;
    });

    setTimeout(() => {
      this.isSaveing = false;
      this.progresPercent = 0;
    }, 500);
  }

  // === ↓ ここから追加（UIからの処理） ↓ ===
  get roomName(): string {
    return Network.peer && 0 < Network.peer.roomName.length ? Network.peer.roomName : 'ルームデータ';
  }

  private appendTimestamp(fileName: string): string {
    let date = new Date();
    let year = date.getFullYear();
    let month = ('00' + (date.getMonth() + 1)).slice(-2);
    let day = ('00' + date.getDate()).slice(-2);
    let hours = ('00' + date.getHours()).slice(-2);
    let minutes = ('00' + date.getMinutes()).slice(-2);
    return fileName + `_${year}-${month}-${day}_${hours}${minutes}`;
  }

  saveLog(){
    if (!this.selectedTab) return;
    let fileName: string = this.appendTimestamp(this.roomName + '_log_' + this.selectedTab.name);
    if (this.modeCocLog) this.saveDataService.saveHtmlChatLogCoc(this.selectedTab, fileName);
    else this.saveDataService.saveHtmlChatLog(this.selectedTab, fileName);
  }

  saveAllLog(){
    let fileName: string = this.appendTimestamp(this.roomName + '_log_' + '全タブ');
    if (this.modeCocLog) this.saveDataService.saveHtmlChatLogAllCoc(fileName);
    else this.saveDataService.saveHtmlChatLogAll(fileName);
  }
  // === ↑ ここまで追加 ↑ ===

  delete() {
    if (!this.isEmpty && this.selectedTab) {
      this.selectedTabXml = this.selectedTab.toXml();
      this.selectedTab.destroy();
    }
  }

  restore() {
    if (this.selectedTab && this.selectedTabXml) {
      let restoreTable = <ChatTab>ObjectSerializer.instance.parseXml(this.selectedTabXml);
      ChatTabList.instance.addChatTab(restoreTable);
      this.selectedTabXml = '';
    }
  }

  upTabIndex() {
    if (!this.selectedTab) return;
    let parentElement = this.selectedTab.parent;
    let index: number = parentElement.children.indexOf(this.selectedTab);
    if (0 < index) {
      let prevElement = parentElement.children[index - 1];
      parentElement.insertBefore(this.selectedTab, prevElement);
    }
  }

  downTabIndex() {
    if (!this.selectedTab) return;
    let parentElement = this.selectedTab.parent;
    let index: number = parentElement.children.indexOf(this.selectedTab);
    if (index < parentElement.children.length - 1) {
      let nextElement = parentElement.children[index + 1];
      parentElement.insertBefore(nextElement, this.selectedTab);
    }
  }
}
