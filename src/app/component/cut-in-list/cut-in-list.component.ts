import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store';
import { EventSystem } from '@udonarium/core/system';
import { CutIn } from '@udonarium/cut-in';
import { CutInLauncher } from '@udonarium/cut-in-launcher';
import { Jukebox } from '@udonarium/Jukebox';
import { AudioStorage } from '@udonarium/core/file-storage/audio-storage';
import { ImageFile } from '@udonarium/core/file-storage/image-file';
import { ImageStorage } from '@udonarium/core/file-storage/image-storage';
import { ModalService } from 'service/modal.service';
import { PanelService } from 'service/panel.service';
import { SaveDataService } from 'service/save-data.service';
import { FileSelecterComponent } from 'component/file-selecter/file-selecter.component';
import { CutInBgmComponent } from '../cut-in-bgm/cut-in-bgm.component';

@Component({
  selector: 'app-cut-in-list',
  templateUrl: './cut-in-list.component.html'
})
export class CutInListComponent implements OnInit, OnDestroy {
  get cutInLauncher(): CutInLauncher { return ObjectStore.instance.get<CutInLauncher>('CutInLauncher'); }
  get jukebox(): Jukebox { return ObjectStore.instance.get<Jukebox>('Jukebox'); }

  selectedCutIn: CutIn = null;
  isSaveing = false;

  // バインディング用ゲッター/セッター
  get cutInName() { return this.selectedCutIn?.name || ''; }
  set cutInName(v) { if (this.selectedCutIn) this.selectedCutIn.name = v; }
  get cutInWidth() { return this.selectedCutIn?.width || 0; }
  set cutInWidth(v) { 
    if (this.selectedCutIn) {
      this.selectedCutIn.width = v;
      if (this.keepImageAspect) this.selectedCutIn.height = Math.floor(v * this.originalImgHeight() / this.originalImgWidth());
    }
  }
  get cutInHeight() { return this.selectedCutIn?.height || 0; }
  set cutInHeight(v) { 
    if (this.selectedCutIn) {
      this.selectedCutIn.height = v;
      if (this.keepImageAspect) this.selectedCutIn.width = Math.floor(v * this.originalImgWidth() / this.originalImgHeight());
    }
  }
  get cutInOriginalSize() { return this.selectedCutIn?.originalSize || false; }
  set cutInOriginalSize(v) { 
    if (this.selectedCutIn) {
      this.selectedCutIn.originalSize = v;
      if (v) {
        this.selectedCutIn.width = this.originalImgWidth();
        this.selectedCutIn.height = this.originalImgHeight();
      }
    }
  }
  get keepImageAspect() { return this.selectedCutIn?.keepImageAspect || false; }
  set keepImageAspect(v) { if (this.selectedCutIn) this.selectedCutIn.keepImageAspect = v; }
  get cutInX_Pos() { return this.selectedCutIn?.x_pos || 0; }
  set cutInX_Pos(v) { if (this.selectedCutIn) this.selectedCutIn.x_pos = v; }
  get cutInY_Pos() { return this.selectedCutIn?.y_pos || 0; }
  set cutInY_Pos(v) { if (this.selectedCutIn) this.selectedCutIn.y_pos = v; }
  get cutInIsLoop() { return this.selectedCutIn?.isLoop || false; }
  set cutInIsLoop(v) { if (this.selectedCutIn) this.selectedCutIn.isLoop = v; }
  get cutInOutTime() { return this.selectedCutIn?.outTime || 0; }
  set cutInOutTime(v) { if (this.selectedCutIn) this.selectedCutIn.outTime = v; }
  get chatActivate() { return this.selectedCutIn?.chatActivate || false; }
  set chatActivate(v) { if (this.selectedCutIn) this.selectedCutIn.chatActivate = v; }
  get cutInTagName() { return this.selectedCutIn?.tagName || ''; }
  set cutInTagName(v) { if (this.selectedCutIn) this.selectedCutIn.tagName = v; }
  get cutInAudioName() { return this.selectedCutIn?.audioName || ''; }
  get cutInAudioIdentifier() { return this.selectedCutIn?.audioIdentifier || ''; }
  
  get cutInImageUrl(): string {
    if (!this.selectedCutIn) return ImageFile.Empty.url;
    return this.selectedCutIn.cutInImage.url;
  }

  // 既存のゲッター・セッター群の最後に追記
  get cutInIsVideo(): boolean { return this.selectedCutIn?.isVideoCutIn || false; }
  set cutInIsVideo(v: boolean) { if (this.selectedCutIn) { this.selectedCutIn.isVideoCutIn = v; this.changeYouTubeInfo(); } }
  
  get cutInVideoURL(): string { return this.selectedCutIn?.videoUrl || ''; }
  set cutInVideoURL(v: string) { if (this.selectedCutIn) { this.selectedCutIn.videoUrl = v; this.changeYouTubeInfo(); } }

  isYouTubeCutIn = false;

  selectCutIn(identifier: string) { 
    this.selectedCutIn = ObjectStore.instance.get<CutIn>(identifier); 
    this.isYouTubeCutIn = this.selectedCutIn?.videoId ? true : false;
  }
  

  changeYouTubeInfo() {
    if (!this.selectedCutIn) return;
    const isVideo = this.selectedCutIn.videoId ? true : false;
    if ((!this.isYouTubeCutIn && isVideo) || (this.isYouTubeCutIn && !isVideo)) {
      if (isVideo) {
        this.selectedCutIn.width = this.selectedCutIn.defVideoSizeWidth;
        this.selectedCutIn.height = this.selectedCutIn.defVideoSizeHeight;
      } else {
        this.selectedCutIn.width = this.originalImgWidth();
        this.selectedCutIn.height = this.originalImgHeight();
      }
    }
    this.isYouTubeCutIn = isVideo;
  }

  constructor(
    private modalService: ModalService,
    private panelService: PanelService,
    private saveDataService: SaveDataService
  ) { }

  // ngOnInit() { Promise.resolve().then(() => this.modalService.title = this.panelService.title = 'カットイン編集'); }
  // cut-in-list.component.ts の ngOnInit を修正
ngOnInit() {
  Promise.resolve().then(() => {
    this.modalService.title = this.panelService.title = 'カットインリスト';
    // ▼ UdonariumのPanelServiceに初期サイズを命令する
    this.panelService.width = 700; 
    this.panelService.height = 730;
  });
}
  ngOnDestroy() { EventSystem.unregister(this); }

  getCutIns(): CutIn[] { return ObjectStore.instance.getObjects(CutIn); }

createCutIn() {
    let cutIn = new CutIn();
    cutIn.name = '新しいカットイン';
    // ▼ 追加：初期画像としてデフォルトの仮画像をセット
    cutIn.imageIdentifier = 'testTableBackgroundImage_image';
    cutIn.initialize();
    this.selectCutIn(cutIn.identifier);
  }

  async save() {
    if (!this.selectedCutIn) return;
    this.isSaveing = true;
    let fileName: string = 'cut_' + this.selectedCutIn.name;
    await this.saveDataService.saveGameObjectAsync(this.selectedCutIn, fileName, percent => {});
    this.isSaveing = false;
  }

  delete() {
    if (this.selectedCutIn) {
      this.selectedCutIn.destroy();
      this.selectedCutIn = null;
    }
  }

  openCutInImageModal() {
    this.modalService.open<string>(FileSelecterComponent).then(value => {
      if (this.selectedCutIn && value) {
        this.selectedCutIn.imageIdentifier = value;
        setTimeout(() => this.chkImageAspect(), 100);
      }
    });
  }

  openCutInBgmModal() {
    this.modalService.open<string>(CutInBgmComponent).then(value => {
      if (this.selectedCutIn && value) {
        this.selectedCutIn.audioIdentifier = value;
        let audio = AudioStorage.instance.get(value);
        if (audio) this.selectedCutIn.audioName = audio.name;
      }
    });
  }

  isCutInBgmUploaded() {
    return this.selectedCutIn && !!AudioStorage.instance.get(this.selectedCutIn.audioIdentifier);
  }

  originalImgWidth() {
    if (!this.selectedCutIn || !this.selectedCutIn.cutInImage.url) return 0;
    let img = new Image(); img.src = this.selectedCutIn.cutInImage.url; return img.width;
  }
  originalImgHeight() {
    if (!this.selectedCutIn || !this.selectedCutIn.cutInImage.url) return 0;
    let img = new Image(); img.src = this.selectedCutIn.cutInImage.url; return img.height;
  }

  chkImageAspect() {
    if (this.keepImageAspect && this.selectedCutIn) {
      this.selectedCutIn.height = Math.floor(this.selectedCutIn.width * this.originalImgHeight() / this.originalImgWidth());
    }
  }

  previewCutIn() {
    if (this.cutInOriginalSize) {
      this.selectedCutIn.width = this.originalImgWidth();
      this.selectedCutIn.height = this.originalImgHeight();
    }
    this.cutInLauncher.startCutInMySelf(this.selectedCutIn);
  }

  playCutIn() {
    if (this.cutInOriginalSize) {
      this.selectedCutIn.width = this.originalImgWidth();
      this.selectedCutIn.height = this.originalImgHeight();
    }
    if (this.isCutInBgmUploaded() && this.cutInTagName == '') this.jukebox.stop();
    this.cutInLauncher.startCutIn(this.selectedCutIn);
  }

  stopCutIn() {
    if (this.selectedCutIn) this.cutInLauncher.stopCutIn(this.selectedCutIn);
  }
}