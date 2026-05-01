import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';

import { AudioFile } from '@udonarium/core/file-storage/audio-file';
import { AudioPlayer, VolumeType } from '@udonarium/core/file-storage/audio-player';
import { AudioStorage } from '@udonarium/core/file-storage/audio-storage';
import { FileArchiver } from '@udonarium/core/file-storage/file-archiver';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';
import { EventSystem } from '@udonarium/core/system';
import { Jukebox } from '@udonarium/Jukebox';

import { ModalService } from 'service/modal.service';
import { PanelOption,PanelService } from 'service/panel.service';

import { CutInListComponent } from 'component/cut-in-list/cut-in-list.component';
import { PointerDeviceService } from 'service/pointer-device.service';
import { CutInLauncher } from '@udonarium/cut-in-launcher';

@Component({
  selector: 'app-jukebox',
  templateUrl: './jukebox.component.html',
  styleUrls: ['./jukebox.component.css']
})
export class JukeboxComponent implements OnInit, OnDestroy {

  roomVolumeChange = false; // 全体音量変更の誤操作防止フラグ

  // ▼ 追加：全体音量（GM同期用）
  get roomVolume(): number { return this.jukebox.roomVolume; }
  set roomVolume(volume: number) {
    this.jukebox.roomVolume = volume;
    this.jukebox.setNewVolume();
  }

  // ▼ 修正：BGM音量（個人 × 全体）
  get volume(): number { return this.jukebox.volume; }
  set volume(volume: number) { 
    this.jukebox.volume = volume;
    AudioPlayer.volume = volume * this.roomVolume;
  }

  // ▼ 修正：試聴音量（個人 × 全体）
  get auditionVolume(): number { return this.jukebox.auditionVolume; }
  set auditionVolume(auditionVolume: number) { 
    this.jukebox.auditionVolume = auditionVolume;
    AudioPlayer.auditionVolume = auditionVolume * this.roomVolume;
  }

  // ▼ 独自拡張：着信音音量（ローカル保存）
  get ringtoneVolume(): number {
    let vol = localStorage.getItem('ringtoneVolume');
    return vol !== null ? parseFloat(vol) : 0.5; // 初期値0.5
  }
  set ringtoneVolume(volume: number) {
    localStorage.setItem('ringtoneVolume', volume.toString());
  }

  get audios(): AudioFile[] { return AudioStorage.instance.audios.filter(audio => !audio.isHidden); }
  get jukebox(): Jukebox { return ObjectStore.instance.get<Jukebox>('Jukebox'); }

  readonly auditionPlayer: AudioPlayer = new AudioPlayer();
  private lazyUpdateTimer: NodeJS.Timeout = null;

  constructor(
    private modalService: ModalService,
    private panelService: PanelService,
    private pointerDeviceService: PointerDeviceService,
    private ngZone: NgZone
  ) { }

  ngOnInit() {
    Promise.resolve().then(() => this.modalService.title = this.panelService.title = 'ジュークボックス');
    this.auditionPlayer.volumeType = VolumeType.AUDITION;
    EventSystem.register(this)
      .on('*', event => {
        if (event.eventName.startsWith('FILE_')) this.lazyNgZoneUpdate();
      });
  }

  ngOnDestroy() {
    EventSystem.unregister(this);
    this.stop();
  }

  play(audio: AudioFile) {
    this.auditionPlayer.play(audio);
  }

  stop() {
    this.auditionPlayer.stop();
  }

  playBGM(audio: AudioFile) {
    this.jukebox.play(audio.identifier, true);
  }

  stopBGM(audio: AudioFile) {
    if (this.jukebox.audio === audio) this.jukebox.stop();
  }

  handleFileSelect(event: Event) {
    let input = <HTMLInputElement>event.target;
    let files = input.files;
    if (files.length) FileArchiver.instance.load(files);
    input.value = '';
  }

  private lazyNgZoneUpdate() {
    if (this.lazyUpdateTimer !== null) return;
    this.lazyUpdateTimer = setTimeout(() => {
      this.lazyUpdateTimer = null;
      this.ngZone.run(() => { });
    }, 100);
  }

// ▼ 修正：本物のリスト画面を呼び出す
  openCutInList() {
    let coordinate = this.pointerDeviceService.pointers[0];
    let option: PanelOption = { left: coordinate.x + 25, top: coordinate.y + 25, width: 650, height: 740 };
    this.panelService.open<CutInListComponent>(CutInListComponent, option);
  }
}