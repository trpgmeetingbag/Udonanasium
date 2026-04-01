// src/app/component/chat-detail-setting/chat-detail-setting.component.ts
import { Component } from '@angular/core';
import { ChatSettingsService } from 'service/chat-settings.service';

@Component({
  selector: 'chat-detail-setting',
  templateUrl: './chat-detail-setting.component.html',
  styleUrls: ['./chat-detail-setting.component.css'] // ←これを追加
})
export class ChatDetailSettingComponent {
  // テンプレート側で双方向バインディングするためにサービスを注入
  constructor(public chatSettingsService: ChatSettingsService) { }
}