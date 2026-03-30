import { Component, Input } from '@angular/core';
import { ChatTab } from '@udonarium/chat-tab';
import { ChatTabList } from '@udonarium/chat-tab-list';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';

@Component({
  selector: 'chat-tachie',
  templateUrl: './chat-tachie.component.html',
  styleUrls: ['./chat-tachie.component.css']
})
export class ChatTachieComponent {
  @Input() chatTabidentifier: string = '';

  get chatTab(): ChatTab {
    return ObjectStore.instance.get<ChatTab>(this.chatTabidentifier);
  }

  get chatTabList(): ChatTabList {
    return ChatTabList.instance;
  }

  // 表示フラグがONなら、設定された高さ分の「物理的な空間」をチャットウィンドウ内に確保する
  get tachieAreaHeight(): number {
    if (this.chatTab && this.chatTab.tachieDispFlag && this.chatTabList.isTachieInWindow) {
      return this.chatTabList.tachieHeightValue;
    }
    return 0;
  }
}