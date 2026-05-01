import { AudioFile } from './core/file-storage/audio-file';
import { AudioPlayer } from './core/file-storage/audio-player';
import { AudioStorage } from './core/file-storage/audio-storage';
import { SyncObject, SyncVar } from './core/synchronize-object/decorator';
import { GameObject, ObjectContext } from './core/synchronize-object/game-object';
import { EventSystem } from './core/system';

import { Config } from './config'; // ←互換性のために追記

@SyncObject('jukebox')
export class Jukebox extends GameObject {
  @SyncVar() audioIdentifier: string = '';
  @SyncVar() startTime: number = 0;
  @SyncVar() isLoop: boolean = false;
  @SyncVar() isPlaying: boolean = false;
  
  // ▼ 追加：全体音量（ネットワーク同期される）
  @SyncVar() roomVolume: number = 1.0; 

  get audio(): AudioFile { return AudioStorage.instance.get(this.audioIdentifier); }

  private audioPlayer: AudioPlayer = new AudioPlayer();

  // ▼ 追加：個人の音量（同期しないローカルな値）
  private _volume = 0.5;
  get volume(): number { return this._volume; }
  set volume(volume: number) { this._volume = volume; }

  private _auditionVolume = 0.5;
  get auditionVolume(){ return this._auditionVolume;}
  set auditionVolume(_auditionVolume: number){ this._auditionVolume = _auditionVolume; }

  // ▼ 追加：個人音量 × 全体音量 の計算結果をAudioPlayerに適用する
  setNewVolume() {
    AudioPlayer.volume = this.volume * this.roomVolume;
    AudioPlayer.auditionVolume = this.auditionVolume * this.roomVolume;
  }

  // GameObject Lifecycle
  onStoreAdded() {
    super.onStoreAdded();
    this.unlockAfterUserInteraction();
  }

  // GameObject Lifecycle
  onStoreRemoved() {
    super.onStoreRemoved();
    this._stop();
  }

  play(identifier: string, isLoop: boolean = false) {
    let audio = AudioStorage.instance.get(identifier);
    if (!audio || !audio.isReady) return;
    this.audioIdentifier = identifier;
    this.isPlaying = true;
    this.isLoop = isLoop;
    this._play();
  }

  private _play() {
    this._stop();
    if (!this.audio || !this.audio.isReady) {
      this.playAfterFileUpdate();
      return;
    }
    this.audioPlayer.loop = true;
    this.audioPlayer.play(this.audio);
  }

  stop() {
    this.audioIdentifier = '';
    this.isPlaying = false;
    this._stop();
  }

  private _stop() {
    this.unregisterEvent();
    this.audioPlayer.stop();
  }

  private playAfterFileUpdate() {
    EventSystem.register(this)
      .on('UPDATE_AUDIO_RESOURE', event => {
        this._play();
      });
  }

  private unlockAfterUserInteraction() {
    let callback = () => {
      document.body.removeEventListener('touchstart', callback, true);
      document.body.removeEventListener('mousedown', callback, true);
      this.audioPlayer.stop();
      if (this.isPlaying) this._play();
    }
    document.body.addEventListener('touchstart', callback, true);
    document.body.addEventListener('mousedown', callback, true);
  }

  private unregisterEvent() {
    EventSystem.unregister(this, 'UPDATE_AUDIO_RESOURE');
  }

  // override
  apply(context: ObjectContext) {
    let audioIdentifier = this.audioIdentifier;
    let isPlaying = this.isPlaying;
    let currentRoomVolume = this.roomVolume; // 追加：変更前の全体音量を記録

    super.apply(context);
    
    if ((audioIdentifier !== this.audioIdentifier || !isPlaying) && this.isPlaying) {
      this._play();
    } else if (isPlaying !== this.isPlaying && !this.isPlaying) {
      this._stop();
    }

    // ▼ 追加：ネットワーク経由で全体音量が変更されたら即座に再計算
    if (currentRoomVolume !== this.roomVolume) {
      this.setNewVolume();
    }
  }
}