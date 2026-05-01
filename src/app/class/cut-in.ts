import { AudioFile } from './core/file-storage/audio-file';
import { AudioPlayer } from './core/file-storage/audio-player';
import { AudioStorage } from './core/file-storage/audio-storage';
import { SyncObject, SyncVar } from './core/synchronize-object/decorator';
import { GameObject } from './core/synchronize-object/game-object';
import { ImageFile } from './core/file-storage/image-file';
import { ImageStorage } from './core/file-storage/image-storage';

@SyncObject('cut-in')
export class CutIn extends GameObject {
  @SyncVar() name = 'カットイン';
  @SyncVar() width = 480;
  @SyncVar() height = 320;
  @SyncVar() originalSize = true;
  @SyncVar() x_pos = 50;
  @SyncVar() y_pos = 50;

  @SyncVar() imageIdentifier = 'imageIdentifier';
  @SyncVar() audioIdentifier = '';
  @SyncVar() audioName = '';
  @SyncVar() startTime = 0;
  @SyncVar() tagName = '';
  @SyncVar() selected = false;
  @SyncVar() isLoop = false;
  @SyncVar() chatActivate = false;
  @SyncVar() outTime = 0;
  @SyncVar() isPlaying = false;
  @SyncVar() keepImageAspect = false;

  @SyncVar() isVideoCutIn = false;
  @SyncVar() videoUrl = '';

  

  get audio(): AudioFile { return AudioStorage.instance.get(this.audioIdentifier); }
  get cutInImage(): ImageFile {
    if (!this.imageIdentifier) return ImageFile.Empty;
    const file = ImageStorage.instance.get(this.imageIdentifier);
    return file ? file : ImageFile.Empty;
  }


// ▼ ここから下をごっそり追加・上書きします
  get videoId(): string {
    if (!this.isVideoCutIn || !this.videoUrl) return '';
    let ret = '';
    if (this.validUrl(this.videoUrl)) {
      const hostname = (new URL(this.videoUrl)).hostname;
      if (hostname == 'youtube.com' || hostname == 'www.youtube.com') {
        let tmp = this.videoUrl.split('v=');
        if (tmp[1]) ret = encodeURI(tmp[1].split(/[\?\&\#\/]/)[0]);
      } else if (hostname == 'youtu.be') {
        let tmp = this.videoUrl.split('youtu.be/');
        if (tmp[1]) ret = encodeURI(tmp[1].split(/[\?\&\#\/]/)[0]);
      } else {
        return '';
      }
    }
    return ret.replace(/[\<\>\/\:\s\r\n]/g, '');
  }

get videoStart(): number | undefined {
    if (!this.isVideoCutIn || !this.videoUrl || !this.videoId) return undefined;
    const result = /[\&\?](?:start|t)\=([\dhms]+)/i.exec(this.videoUrl);
    if (result && result[1]) return this._sec(result[1]);
    return undefined;
  }

  private _sec(str: string): number | undefined {
    if (!str) return undefined;
    let tmp = null;
    if (tmp = /^(\d+)$/.exec(str)) return parseInt(tmp[1], 10);
    else if (tmp = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(str)) {
      let sec = 0;
      if (tmp[1]) sec += +tmp[1] * 60 * 60;
      if (tmp[2]) sec += +tmp[2] * 60;
      if (tmp[3]) sec += +tmp[3];
      return sec;
    }
    return undefined;
  }

  get playListId(): string {
    if (!this.isVideoCutIn || !this.videoId) return '';
    let ret = '';
    if (this.validUrl(this.videoUrl)) {
      let tmp = this.videoUrl.split('list=');
      if (tmp[1]) ret = encodeURI(tmp[1].split(/[\&\#\/]/)[0]);
    }
    return ret.replace(/[\<\>\/\:\s\r\n]/g, '');
  }

  validUrl(url: string): boolean {
    if (!url) return false;
    try { new URL(url.trim()); } catch (e) { return false; }
    return /^https?\:\/\//.test(url.trim());
  }

  // デフォルトサイズ定義
  get defVideoSizeWidth(): number { return 640; }
  get defVideoSizeHeight(): number { return 360; }
  minSizeWidth(isVideo: boolean): number { return isVideo ? 448 : 10; }
  maxSizeWidth(isVideo: boolean): number { return isVideo ? 1920 : 1200; }
  minSizeHeight(isVideo: boolean): number { return isVideo ? 252 : 10; }
  maxSizeHeight(isVideo: boolean): number { return isVideo ? 1080 : 1200; }


  
}