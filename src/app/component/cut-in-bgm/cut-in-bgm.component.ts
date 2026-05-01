import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { AudioFile } from '@udonarium/core/file-storage/audio-file';
import { AudioPlayer, VolumeType } from '@udonarium/core/file-storage/audio-player';
import { AudioStorage } from '@udonarium/core/file-storage/audio-storage';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';
import { Jukebox } from '@udonarium/Jukebox';
import { ModalService } from 'service/modal.service';
import { PanelService } from 'service/panel.service';

@Component({
  selector: 'app-cut-in-bgm',
  templateUrl: './cut-in-bgm.component.html'
})
export class CutInBgmComponent implements OnInit, OnDestroy {
  get audios(): AudioFile[] { return AudioStorage.instance.audios.filter(audio => !audio.isHidden); }
  get jukebox(): Jukebox { return ObjectStore.instance.get<Jukebox>('Jukebox'); }
  readonly auditionPlayer: AudioPlayer = new AudioPlayer();

  constructor(private modalService: ModalService, private panelService: PanelService) { }

  ngOnInit() {
    Promise.resolve().then(() => this.modalService.title = this.panelService.title = 'カットインBGM選択');
    this.auditionPlayer.volumeType = VolumeType.AUDITION;
  }
  ngOnDestroy() { this.stop(); }
  play(audio: AudioFile) { this.auditionPlayer.play(audio); }
  stop() { this.auditionPlayer.stop(); }
  
  selectBgm(file: AudioFile) {
    if (!file) return;
    this.modalService.resolve(file.identifier);
  }
}