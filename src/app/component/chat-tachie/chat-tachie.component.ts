import { Component, Input } from '@angular/core';
import { ChatTab } from '@udonarium/chat-tab';
import { ChatTabList } from '@udonarium/chat-tab-list';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';

// 追加：サービスとコンポーネントのインポート（パスは実際の環境に合わせてください）
import { PanelService } from 'service/panel.service';
import { ChatSettingsService } from 'service/chat-settings.service';
import { ChatDetailSettingComponent } from 'component/chat-detail-setting/chat-detail-setting.component';

@Component({
  selector: 'chat-tachie',
  templateUrl: './chat-tachie.component.html',
  styleUrls: ['./chat-tachie.component.css']
})
export class ChatTachieComponent {
  @Input() chatTabidentifier: string = '';

  
  constructor(
    public chatSettingsService: ChatSettingsService,
    private panelService: PanelService
  ) {}

  get chatTab(): ChatTab {
    return ObjectStore.instance.get<ChatTab>(this.chatTabidentifier);
  }

  get chatTabList(): ChatTabList {
    return ChatTabList.instance;
  }

  // 追加：詳細設定ウィンドウを開く処理
  openDetailSettings(event: MouseEvent) {
    // クリックされたボタンの位置を基準に、詳細ウィンドウを表示する初期位置を計算する
    // 例：クリック位置から右に50px、下に20pxずらして表示
    const initialLeft = event.clientX + 50;
    const initialTop = event.clientY + 20;

    this.panelService.open(ChatDetailSettingComponent, {
      width: 320, // 若干幅を広げてレイアウトを安定させる
      height: 250,
      title: 'チャット詳細設定',
      left: initialLeft, // 計算したX座標を指定
      top: initialTop    // 計算したY座標を指定
    });
  }

  // // 表示フラグがONなら、設定された高さ分の「物理的な空間」をチャットウィンドウ内に確保する
  // get tachieAreaHeight(): number {
  //   if (this.chatTab && this.chatTab.tachieDispFlag && this.chatTabList.isTachieInWindow) {
  //     return this.chatTabList.tachieHeightValue;
  //   }
  //   return 0;
  // }


  // === ↓ ここから追加・修正 ↓ ===

  // 1. ローカルの表示フラグを取得・設定する（タブごとに記憶）
  get tachieDispFlag(): boolean {
    if (this.chatSettingsService.tachieDispMap[this.chatTabidentifier] === undefined) {
      return true; // 初期状態は表示(true)
    }
    return this.chatSettingsService.tachieDispMap[this.chatTabidentifier];
  }

  set tachieDispFlag(value: boolean) {
    this.chatSettingsService.tachieDispMap[this.chatTabidentifier] = value;
  }

  // 2. ローカルのサイズを取得・設定する
  get tachieHeightValue(): number {
    return this.chatSettingsService.tachieHeightValue;
  }

  set tachieHeightValue(value: number) {
    this.chatSettingsService.tachieHeightValue = value;
  }

  // 3. 表示領域の計算（chatTabの共有フラグではなく、個人のローカルフラグを見るように変更）
  get tachieAreaHeight(): number {
    // 修正: this.chatTab.tachieDispFlag を this.tachieDispFlag に変更
    // 修正: this.chatTabList.tachieHeightValue を this.tachieHeightValue に変更
    if (this.chatTab && this.tachieDispFlag && this.chatTabList.isTachieInWindow) {
      return this.tachieHeightValue;
    }
    return 0;
  }
  // === ↑ ここまで追加・修正 ↑ ===
}