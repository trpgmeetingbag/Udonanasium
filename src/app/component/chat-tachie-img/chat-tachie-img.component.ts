
import { Component, Input, ElementRef, AfterViewInit } from '@angular/core'; // ←修正
import { ChatTab } from '@udonarium/chat-tab';
import { ChatTabList } from '@udonarium/chat-tab-list';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';
import { ImageStorage } from '@udonarium/core/file-storage/image-storage';

@Component({
  selector: 'chat-tachie-img',
  templateUrl: './chat-tachie-img.component.html',
  styleUrls: ['./chat-tachie-img.component.css']
})
export class ChatTachieImageComponent {
  @Input() chatTabidentifier: string = '';
  posArray: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  //外枠押出のため消去
  // // ←ここから追加（ElementRefを使えるようにします）
  // constructor(private elementRef: ElementRef) {}

  // ngAfterViewInit() {
  //   // 立ち絵がウィンドウの外側（上方向）に飛び出せるよう、親パネルの切り取り設定を解除します
  //   setTimeout(() => {
  //     const panel = this.elementRef.nativeElement.closest('.panel') as HTMLElement;
  //     if (panel) panel.style.overflow = 'visible';
  //   }, 100);
  // }
  // // ←追加ここまで

  get chatTab(): ChatTab {
    return ObjectStore.instance.get<ChatTab>(this.chatTabidentifier);
  }

  get chatTabList(): ChatTabList {
    return ChatTabList.instance;
  }

  // ★追加：立ち絵表示がONの時だけ、設定された高さの数値を返す
  get tachieAreaHeight(): number {
    if (this.chatTab && this.chatTab.tachieDispFlag) {
      return this.chatTabList.tachieHeightValue;
    }
    return 0;
  }
  // 指定されたPOSの画像URLを取得
  getImageUrl(pos: number): string {
    if (!this.chatTab || !this.chatTab.imageIdentifier) return '';
    let identifier = this.chatTab.imageIdentifier[pos];
    if (!identifier || identifier === ' ') return ''; // 空や半角スペースなら表示しない
    let image = ImageStorage.instance.get(identifier);
    return image ? image.url : '';
  }

  // 画像クリックでそのPOSの立ち絵を消す
  tachieClick(pos: number) {
    if (this.chatTab) {
      this.chatTab.tachiePosHide(pos);
    }
  }
}