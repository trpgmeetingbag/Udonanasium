import { AfterViewInit, Component, Input, NgZone, OnDestroy, OnInit } from '@angular/core';
import { AudioPlayer } from '@udonarium/core/file-storage/audio-player';
import { EventSystem } from '@udonarium/core/system';
import { CutIn } from '@udonarium/cut-in';
import { PanelService } from 'service/panel.service';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';
import { Jukebox } from '@udonarium/Jukebox';
import { Config } from '@udonarium/config';

@Component({
  selector: 'app-cut-in-window',
  templateUrl: './cut-in-window.component.html',
  styleUrls: ['./cut-in-window.component.css']
})
export class CutInWindowComponent implements AfterViewInit, OnInit, OnDestroy {
  @Input() cutIn: CutIn = null;
  left = 0; top = 0; width = 200; height = 150;
  readonly audioPlayer: AudioPlayer = new AudioPlayer();
  private cutInTimeOut: NodeJS.Timeout = null;

  get jukebox(): Jukebox { return ObjectStore.instance.get<Jukebox>('Jukebox'); }
  get config(): Config { return ObjectStore.instance.get<Config>('Config'); }

  constructor(private panelService: PanelService, private ngZone: NgZone) { }

  ngOnInit() {
    // YouTube API スクリプトの動的読み込み
    if (!window['YT']) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
    }

    EventSystem.register(this)
      .on('START_CUT_IN', event => {
        if (this.cutIn && (this.cutIn.identifier === event.data.cutIn.identifier || this.cutIn.tagName === event.data.cutIn.tagName)) {
          this.panelService.close();
        }
      })
      .on('STOP_CUT_IN_BY_BGM', event => {
        if (this.cutIn && this.cutIn.tagName === '') this.panelService.close();
      })
      .on('STOP_CUT_IN', event => {
        if (this.cutIn && this.cutIn.identifier === event.data.cutIn.identifier) this.panelService.close();
      });

    this.startCutIn();
  }

  ngAfterViewInit() {
    if (this.cutIn) setTimeout(() => this.moveCutInPos(), 0);
  }

  ngOnDestroy() {
    if (this.cutInTimeOut) clearTimeout(this.cutInTimeOut);
    this.audioPlayer.stop();
    EventSystem.unregister(this);
  }

  startCutIn() {
    if (!this.cutIn) return;
    if (this.cutIn.audio && !this.cutIn.videoId) {
      this.audioPlayer.loop = this.cutIn.isLoop;
      this.audioPlayer.play(this.cutIn.audio);
    }
    if (this.cutIn.outTime > 0) {
      this.cutInTimeOut = setTimeout(() => this.panelService.close(), this.cutIn.outTime * 1000);
    }
  }

  moveCutInPos() {
    if (this.cutIn) {
      let margin_w = Math.max(0, window.innerWidth - this.cutIn.width);
      let margin_h = Math.max(0, window.innerHeight - this.cutIn.height - 25);
      this.width = this.cutIn.width;
      this.height = this.cutIn.height + 25;
      this.left = margin_w * this.cutIn.x_pos / 100;
      this.top = margin_h * this.cutIn.y_pos / 100;
    }
    this.panelService.width = this.width;
    this.panelService.height = this.height;
    this.panelService.left = this.left;
    this.panelService.top = this.top;
  }

  onPlayerReady(event: any) {
    const videoVolume = (this.jukebox ? this.jukebox.volume : 0.5) * (this.config ? this.config.roomVolume : 1) * 100;
    event.target.setVolume(videoVolume);
    event.target.playVideo();
  }

  onPlayerStateChange(event: any) {
    // state == 0 は再生終了
    if (event.data === 0) {
      if (this.cutInTimeOut) clearTimeout(this.cutInTimeOut);
      this.panelService.close();
    }
  }
}