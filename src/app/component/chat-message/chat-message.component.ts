import { animate, keyframes, style, transition, trigger } from '@angular/animations';
import { ChangeDetectionStrategy, Component, Input, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';

import { ChatMessage } from '@udonarium/chat-message';
import { ImageFile } from '@udonarium/core/file-storage/image-file';
import { ChatMessageService } from 'service/chat-message.service';
import { ChatSettingsService } from '../../service/chat-settings.service';
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
  
  // START: リリィ互換 プロパティの受け皿（エラー解消用）
  @Input() simpleDispFlagTime: boolean = false;
  @Input() simpleDispFlagUserId: boolean = false;
  @Input() chatSimpleDispFlag: boolean = false;
  // END

  imageFile: ImageFile = ImageFile.Empty;
  animeState: string = 'inactive';
  private subscription: Subscription;

  constructor(
    private chatMessageService: ChatMessageService,
    public chatSettingsService: ChatSettingsService,
    private changeDetector: ChangeDetectorRef 
  ) { }

  ngOnInit() {
    let file: ImageFile = this.chatMessage.image;
    if (file) this.imageFile = file;
    let time = this.chatMessageService.getTime();
    if (time - 10 * 1000 < this.chatMessage.timestamp) this.animeState = 'active';

    this.subscription = this.chatSettingsService.settingsChanged.subscribe(() => {
      this.changeDetector.markForCheck();
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  discloseMessage() {
    this.chatMessage.tag = this.chatMessage.tag.replace('secret', '');
  }

  editMessage() {
    if (!this.chatMessage.isSendFromSelf) return;

    const EDIT_MARK = ' (編集済)';
    let currentText = this.chatMessage.text;

    if (currentText.endsWith(EDIT_MARK)) {
      currentText = currentText.slice(0, -EDIT_MARK.length);
    }

    const newText = window.prompt('発言内容を編集します', currentText);

    if (newText !== null && newText.trim() !== '' && newText !== currentText) {
      this.chatMessage.value = newText + EDIT_MARK;
    }
  }

  // START: リリィ互換 ルビ振り機能
  escapeHtmlAndRuby(text: string) {
    let escapeText = this.escapeHtml(text);
    return escapeText.replace(/[\|｜]([^\|｜\s]+?)《(.+?)》/g, '<ruby style="white-space:normal;">$1<rt>$2</rt></ruby>').replace(/\\s/g,' ');
  }

  escapeHtml(text: string) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  // END
}