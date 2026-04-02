// // src/app/service/chat-settings.service.ts
import { Injectable, EventEmitter } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ChatSettingsService {
  // 設定変更を各コンポーネントに通知するためのイベント
  public settingsChanged = new EventEmitter<void>();

  // 内部変数とGetter/Setter（値が変わるたびに emit して通知する）
  private _isSimpleMode: boolean = false;
  get isSimpleMode(): boolean { return this._isSimpleMode; }
  set isSimpleMode(value: boolean) { this._isSimpleMode = value; this.settingsChanged.emit(); }

  private _showStandingPicInWindow: boolean = false;
  get showStandingPicInWindow(): boolean { return this._showStandingPicInWindow; }
  set showStandingPicInWindow(value: boolean) { this._showStandingPicInWindow = value; this.settingsChanged.emit(); }

  private _keepStandingPicOutside: boolean = false;
  get keepStandingPicOutside(): boolean { return this._keepStandingPicOutside; }
  set keepStandingPicOutside(value: boolean) { this._keepStandingPicOutside = value; this.settingsChanged.emit(); }

  private _showTimeInSimpleMode: boolean = false;
  get showTimeInSimpleMode(): boolean { return this._showTimeInSimpleMode; }
  set showTimeInSimpleMode(value: boolean) { this._showTimeInSimpleMode = value; this.settingsChanged.emit(); }

  private _showIdInSimpleMode: boolean = false;
  get showIdInSimpleMode(): boolean { return this._showIdInSimpleMode; }
  set showIdInSimpleMode(value: boolean) { this._showIdInSimpleMode = value; this.settingsChanged.emit(); }

  constructor() { }
}

// import { Injectable } from '@angular/core';

// @Injectable({
//   providedIn: 'root'
// })
// export class ChatSettingsService {
//   // 簡易表示のON/OFF（要件2）
//   isSimpleMode: boolean = false;

//   // 詳細設定①〜④（要件3・4）
//   showStandingPicInWindow: boolean = false; // ① 立ち絵をウィンドウ内に表示(未実装)
//   keepStandingPicOutside: boolean = false;  // ② ウィンドウ外の立ち絵を保持
//   showTimeInSimpleMode: boolean = false;    // ③ 簡易表示で時間を表示
//   showIdInSimpleMode: boolean = false;      // ④ 簡易表示でIDを表示

//   constructor() { }
// }