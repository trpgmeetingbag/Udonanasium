import { animate, keyframes, style, transition, trigger } from '@angular/animations';

import { ChatMessage } from '@udonarium/chat-message';
import { ImageFile } from '@udonarium/core/file-storage/image-file';
import { ChatMessageService } from 'service/chat-message.service';

import { ChatSettingsService } from '../../service/chat-settings.service';

// 修正1: ChangeDetectorRef, OnDestroy を import に追加
import { ChangeDetectionStrategy, Component, Input, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
// 修正2: Subscription を import に追加
import { Subscription } from 'rxjs';

@Component({
  selector: 'chat-message',
  templateUrl: './chat-message.component.html',
  styleUrls: ['./chat-message.component.css'],
  animations: [
    trigger('flyInOut', [
      transition('* => active', [
        animate('200ms ease-out', keyframes([
          style({ transform: 'translateX(100px)', opacity: '0', offset: 0 }),
          style({ transform: 'translateX(0)', opacity: '1', offset: 1.0 })
        ]))
      ]),
      transition('void => *', [
        animate('200ms ease-out', keyframes([
          style({ opacity: '0', offset: 0 }),
          style({ opacity: '1', offset: 1.0 })
        ]))
      ])
    ])
  ],
  changeDetection: ChangeDetectionStrategy.Default
})

export class ChatMessageComponent implements OnInit, OnDestroy {
  @Input() chatMessage: ChatMessage;
  imageFile: ImageFile = ImageFile.Empty;
  animeState: string = 'inactive';
// 修正4: イベント購読用の変数を追加
  private subscription: Subscription;

  constructor(
    private chatMessageService: ChatMessageService,
    public chatSettingsService: ChatSettingsService,
    // 修正5: 画面更新用の ChangeDetectorRef を注入
    private changeDetector: ChangeDetectorRef 
  ) { }

ngOnInit() {
    let file: ImageFile = this.chatMessage.image;
    if (file) this.imageFile = file;
    let time = this.chatMessageService.getTime();
    if (time - 10 * 1000 < this.chatMessage.timestamp) this.animeState = 'active';

    // 修正6: 設定変更の通知を受け取り、このメッセージを再描画するようAngularに指示
    this.subscription = this.chatSettingsService.settingsChanged.subscribe(() => {
      this.changeDetector.markForCheck();
    });
  }

  // 修正7: コンポーネントが破棄される際に購読を解除（メモリリーク防止）
  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  discloseMessage() {
    this.chatMessage.tag = this.chatMessage.tag.replace('secret', '');
  }

  // --- START: 発言編集メソッド ---
  editMessage() {
    // UI側の非表示だけでなく、ロジック側でも自身の発言かガードをかける
    if (!this.chatMessage.isSendFromSelf) return;

    const EDIT_MARK = ' (編集済)';
    let currentText = this.chatMessage.text;

    // 既に編集済マークが付いている場合は、入力ダイアログからマークを除外する（重複付与の防止）
    if (currentText.endsWith(EDIT_MARK)) {
      currentText = currentText.slice(0, -EDIT_MARK.length);
    }

    const newText = window.prompt('発言内容を編集します', currentText);

    // キャンセルされた場合や、内容が空、または変更がない場合は処理をスキップ
    if (newText !== null && newText.trim() !== '' && newText !== currentText) {
      // 更新されたテキストの末尾にマークを付与して保存
      // SyncObjectの実体である 'value' を更新し、全プレイヤーに同期
      this.chatMessage.value = newText + EDIT_MARK;
    }
  }
  // --- END ---
}
