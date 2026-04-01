// src/app/service/chat-settings.service.ts
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ChatSettingsService {
  // 簡易表示のON/OFF（要件2）
  isSimpleMode: boolean = false;

  // 詳細設定①〜④（要件3・4）
  showStandingPicInWindow: boolean = false; // ① 立ち絵をウィンドウ内に表示(未実装)
  keepStandingPicOutside: boolean = false;  // ② ウィンドウ外の立ち絵を保持
  showTimeInSimpleMode: boolean = false;    // ③ 簡易表示で時間を表示
  showIdInSimpleMode: boolean = false;      // ④ 簡易表示でIDを表示

  constructor() { }
}