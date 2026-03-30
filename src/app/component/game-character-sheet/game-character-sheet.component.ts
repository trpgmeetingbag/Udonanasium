import { ImageStorage } from '@udonarium/core/file-storage/image-storage';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { EventSystem, Network } from '@udonarium/core/system';
import { DataElement } from '@udonarium/data-element';
import { PresetSound, SoundEffect } from '@udonarium/sound-effect';
import { TabletopObject } from '@udonarium/tabletop-object';
import { FileSelecterComponent } from 'component/file-selecter/file-selecter.component';
import { ModalService } from 'service/modal.service';
import { PanelService } from 'service/panel.service';
import { SaveDataService } from 'service/save-data.service';

@Component({
  selector: 'game-character-sheet',
  templateUrl: './game-character-sheet.component.html',
  styleUrls: ['./game-character-sheet.component.css']
})
export class GameCharacterSheetComponent implements OnInit, OnDestroy {
  @Input() tabletopObject: TabletopObject = null;
  isEdit: boolean = false;
  networkService = Network;
  isSaveing: boolean = false;
  progresPercent: number = 0;

  readonly MAX_TACHIE_POS = 11;

  constructor(
    private saveDataService: SaveDataService,
    private panelService: PanelService,
    private modalService: ModalService
  ) { }

  ngOnInit() {
    EventSystem.register(this)
      .on('DELETE_GAME_OBJECT', event => {
        if (this.tabletopObject && this.tabletopObject.identifier === event.data.identifier) {
          this.panelService.close();
        }
      });
  }

  ngOnDestroy() {
    EventSystem.unregister(this);
  }

  toggleEditMode() {
    this.isEdit = this.isEdit ? false : true;
  }

  addDataElement() {
    if (this.tabletopObject.detailDataElement) {
      let title = DataElement.create('見出し', '', {});
      let tag = DataElement.create('タグ', '', {});
      title.appendChild(tag);
      this.tabletopObject.detailDataElement.appendChild(title);
    }
  }

  clone() {
    let cloneObject = this.tabletopObject.clone();
    cloneObject.location.x += 50;
    cloneObject.location.y += 50;
    if (this.tabletopObject.parent) this.tabletopObject.parent.appendChild(cloneObject);
    cloneObject.update();
    switch (this.tabletopObject.aliasName) {
      case 'terrain':
        SoundEffect.play(PresetSound.blockPut);
        (cloneObject as any).isLocked = false;
        break;
      case 'card':
      case 'card-stack':
        (cloneObject as any).owner = '';
        (cloneObject as any).toTopmost();
      case 'table-mask':
        (cloneObject as any).isLock = false;
        SoundEffect.play(PresetSound.cardPut);
        break;
      case 'text-note':
        (cloneObject as any).toTopmost();
        SoundEffect.play(PresetSound.cardPut);
        break;
      case 'dice-symbol':
        SoundEffect.play(PresetSound.dicePut);
      default:
        SoundEffect.play(PresetSound.piecePut);
        break;
    }
  }

  async saveToXML() {
    if (!this.tabletopObject || this.isSaveing) return;
    this.isSaveing = true;
    this.progresPercent = 0;
    let element = this.tabletopObject.commonDataElement.getFirstElementByName('name');
    let objectName: string = element ? <string>element.value : '';
    await this.saveDataService.saveGameObjectAsync(this.tabletopObject, 'xml_' + objectName, percent => {
      this.progresPercent = percent;
    });
    setTimeout(() => {
      this.isSaveing = false;
      this.progresPercent = 0;
    }, 500);
  }

  setLocation(locationName: string) {
    this.tabletopObject.setLocation(locationName);
  }

  // ーーー同期ロジックの削除（シンプルに戻す）ーーー
  openModal(name: string = '', isAllowedEmpty: boolean = false) {
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: isAllowedEmpty }).then(value => {
      if (!this.tabletopObject || !this.tabletopObject.imageDataElement || !value) return;
      let element = this.tabletopObject.imageDataElement.getFirstElementByName(name);
      if (!element) return;
      element.value = value;
      // ※0番目＝本体画像 になったため、前回追加した手動の同期処理は不要になりました
    });
  }
  // openModal(name: string = '', isAllowedEmpty: boolean = false) {
  //   this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: isAllowedEmpty }).then(value => {
  //     if (!this.tabletopObject || !this.tabletopObject.imageDataElement || !value) return;
  //     let element = this.tabletopObject.imageDataElement.getFirstElementByName(name);
  //     if (!element) return;
  //     element.value = value; // 既存の処理（コマ画像の変更）

  //     // ーーーここから追加ロジックーーー
  //     // 変更されたのがコマ画像（imageIdentifier）だった場合、立ち絵リストの0番目も同期する
  //     if (name === 'imageIdentifier') {
  //       const root = this.tabletopObject.imageDataElement.getFirstElementByName('tachie');
  //       // 立ち絵フォルダが存在し、かつ0番目（基本画像）が既に作成されている場合のみ上書きする
  //       if (root && root.children.length > 0) {
  //         root.children[0].value = value;
  //       }
  //     }
  //     // ーーー追加ロジックここまでーーー
  //   });
  // }

  private get tachieRootElement(): DataElement {
    if (!this.tabletopObject) return null;
    let root = this.tabletopObject.detailDataElement.getFirstElementByName('tachie');
    if (!root) {
      root = new DataElement();
      root.name = 'tachie';
      root.value = '';
      this.tabletopObject.detailDataElement.appendChild(root);

      let posElement = new DataElement();
      posElement.name = 'tachiePosition';
      posElement.value = 0;
      posElement.type = 'number';
      root.appendChild(posElement);
    }
    return root;
  }

  get tachiePosition(): number {
    const root = this.tachieRootElement;
    if (!root) return 0;
    const posElement = root.getFirstElementByName('tachiePosition');
    if (!posElement) return 0;
    return Number(posElement.value) || 0;
  }

  set tachiePosition(value: number) {
    const root = this.tachieRootElement;
    if (!root) return;
    const posElement = root.getFirstElementByName('tachiePosition');
    if (posElement) {
      posElement.value = value;
    }
  }

// ーーーリリィ互換：シート側も imageIdentifier を全て取得ーーー
  get tachieElements(): DataElement[] {
    if (!this.tabletopObject || !this.tabletopObject.imageDataElement) return [];
    // e を DataElement としてキャストしてエラーを解消します
    return this.tabletopObject.imageDataElement.children.filter(e => (e as DataElement).name === 'imageIdentifier') as DataElement[];
  }
  // ーーー変更1：シート側も純粋なリスト参照に統一ーーー
  // get tachieElements(): DataElement[] {
  //   if (!this.tabletopObject || !this.tabletopObject.imageDataElement) return [];
  //   const root = this.tabletopObject.imageDataElement.getFirstElementByName('tachie');
  //   return root ? root.children as DataElement[] : [];
  // }
  // get tachieElements(): DataElement[] {
  //   const root = this.tachieRootElement;
  //   if (!root) return [];
  //   return (root.children as DataElement[]).filter(child => child.type === 'image');
  // }

  getTachieUrl(identifier: string | number): string {
    const image = ImageStorage.instance.get(identifier ? identifier.toString() : '');
    return image ? image.url : '';
  }

  get iconIndex(): number {
    if (this.tachieElements.length === 0 || !this.tabletopObject) return 0;
    const imageElement = this.tabletopObject.imageDataElement?.getFirstElementByName('imageIdentifier');
    if (!imageElement) return 0;
    const index = this.tachieElements.findIndex(t => t.value === imageElement.value);
    return index >= 0 ? index : 0;
  }

  set iconIndex(index: number) {
    if (this.tachieElements.length > index && this.tabletopObject) {
      const imageElement = this.tabletopObject.imageDataElement?.getFirstElementByName('imageIdentifier');
      if (imageElement) {
        imageElement.value = this.tachieElements[index].value;
      }
    }
  }

  // ーーー変更2：画像変更時に、0番目ならコマ画像も同期するーーー
  openTachieImageModal(targetTachie?: DataElement) {
    this.panelService.open(FileSelecterComponent, {
      width: 400,
      height: 600,
      title: targetTachie ? '画像の変更' : '立ち絵画像の追加'
    });

    EventSystem.unregister(this, 'SELECT_FILE');
    EventSystem.register(this).on('SELECT_FILE', event => {
      if (event.data && event.data.fileIdentifier) {
        if (targetTachie) {
          targetTachie.value = event.data.fileIdentifier;
          
          // 【追加ロジック】もし変更されたのが0番目（先頭）なら、コマ本体の画像も書き換える
          if (this.tachieElements.indexOf(targetTachie) === 0) {
            const baseImage = this.tabletopObject.imageDataElement?.getFirstElementByName('imageIdentifier');
            if (baseImage) baseImage.value = event.data.fileIdentifier;
          }
          
        } else {
          this.addTachieImage(event.data.fileIdentifier);
        }
      }
      EventSystem.unregister(this, 'SELECT_FILE');
    });
  }
  // openTachieImageModal(targetTachie?: DataElement) {
  //   this.panelService.open(FileSelecterComponent, {
  //     width: 400,
  //     height: 600,
  //     title: targetTachie ? '画像の変更' : '立ち絵画像の追加'
  //   });

  //   EventSystem.unregister(this, 'SELECT_FILE');
  //   EventSystem.register(this).on('SELECT_FILE', event => {
  //     if (event.data && event.data.fileIdentifier) {
  //       if (targetTachie) {
  //         targetTachie.value = event.data.fileIdentifier;
  //       } else {
  //         this.addTachieImage(event.data.fileIdentifier);
  //       }
  //     }
  //     EventSystem.unregister(this, 'SELECT_FILE');
  //   });
  // }


  // ーーーリリィ互換：立ち絵の追加処理ーーー
  private addTachieImage(identifier: string) {
    let imageRoot = this.tabletopObject.imageDataElement;
    let existingTachies = this.tachieElements;
    
    // 初回のみ、0番目（基本画像）の currentValue に名前を入れておく
    if (existingTachies.length === 1 && (!existingTachies[0].currentValue || existingTachies[0].currentValue === '')) {
      existingTachies[0].currentValue = '基本画像';
    }
    
    // 新しい差分を追加（名前は固定、currentValueに差分名を入れる）
    let newTachie = new DataElement();
    newTachie.name = 'imageIdentifier';
    newTachie.currentValue = '差分' + existingTachies.length;
    newTachie.value = identifier;
    newTachie.type = 'image';
    imageRoot.appendChild(newTachie);
  }
  // ーーー変更3：初回追加時に、現在のコマ画像を「基本画像」として自動確保するーーー
// private addTachieImage(identifier: string) {
//     let root = this.tabletopObject.imageDataElement.getFirstElementByName('tachie');
    
//     // 立ち絵フォルダがまだ無い場合（初めて追加する時）
//     if (!root) {
//       root = new DataElement();
//       root.name = 'tachie';
//       root.type = 'image';
//       this.tabletopObject.imageDataElement.appendChild(root);
      
//       // 初回のみ、現在のコマ画像を「0番目（基本画像）」として自動で登録しておく
//       let baseImage = this.tabletopObject.imageDataElement.getFirstElementByName('imageIdentifier');
//       if (baseImage && baseImage.value) {
//         let defaultTachie = new DataElement();
//         defaultTachie.name = '基本画像';
//         defaultTachie.value = baseImage.value;
//         defaultTachie.type = 'image';
//         root.appendChild(defaultTachie);
//       }
//     }
    
//     // 新しい差分を末尾に追加
//     let newTachie = new DataElement();
//     newTachie.name = '差分' + root.children.length;
//     newTachie.value = identifier;
//     newTachie.type = 'image';
//     root.appendChild(newTachie);
//   }
  // private addTachieImage(identifier: string) {
  //   const root = this.tachieRootElement;
  //   if (!root) return;
  //   const newTachie = new DataElement();
  //   newTachie.name = `差分${this.tachieElements.length}`;
  //   newTachie.value = identifier;
  //   newTachie.type = 'image';
  //   root.appendChild(newTachie);
  // }

  removeTachieImage(element: DataElement) {
    const root = this.tachieRootElement;
    if (root) root.removeChild(element);
  }
}