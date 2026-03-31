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

// --- START: コマ画像変更時に0番目を同期 ---
  openModal(name: string = '', isAllowedEmpty: boolean = false) {
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: isAllowedEmpty }).then(value => {
      if (!this.tabletopObject || !this.tabletopObject.imageDataElement || !value) return;
      let element = this.tabletopObject.imageDataElement.getFirstElementByName(name);
      if (!element) return;
      element.value = value; // 盤面のコマ画像の変更

      // 変更されたのがコマ本体（imageIdentifier）なら、立ち絵の0番目も同期する
      if (name === 'imageIdentifier') {
        let tachies = this.tachieElements;
        if (tachies.length > 0) {
          tachies[0].value = value;
        }
      }
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
    if (!this.tabletopObject || !this.tabletopObject.detailDataElement) return 0;
    let root = this.tabletopObject.detailDataElement.getFirstElementByName('立ち絵位置');
    if (!root) return 0;
    let posElement = root.getFirstElementByName('POS');
    if (!posElement) return 0;
    // currentValue（現在値）を優先して読み取る
    return posElement.currentValue !== undefined ? Number(posElement.currentValue) : Number(posElement.value);
  }
  // get tachiePosition(): number {
  //   const root = this.tachieRootElement;
  //   if (!root) return 0;
  //   const posElement = root.getFirstElementByName('tachiePosition');
  //   if (!posElement) return 0;
  //   return Number(posElement.value) || 0;
  // }

  set tachiePosition(value: number) {
    if (!this.tabletopObject || !this.tabletopObject.detailDataElement) return;
    let root = this.tabletopObject.detailDataElement.getFirstElementByName('立ち絵位置');
    if (!root) {
      root = DataElement.create('立ち絵位置', '', {}, '立ち絵位置_' + this.tabletopObject.identifier);
      this.tabletopObject.detailDataElement.appendChild(root);
    }
    let posElement = root.getFirstElementByName('POS');
    if (!posElement) {
      // 新規作成時は、最大値(value)を11、現在値(currentValue)をスライダーの値に設定
      posElement = DataElement.create('POS', 11, { type: 'numberResource', currentValue: value.toString() }, 'POS_' + this.tabletopObject.identifier);
      root.appendChild(posElement);
    } else {
      // 更新時は現在値のみを変更し、最大値は常に11に固定する
      posElement.currentValue = value;
      posElement.value = 11; 
    }
  }
  // set tachiePosition(value: number) {
  //   const root = this.tachieRootElement;
  //   if (!root) return;
  //   const posElement = root.getFirstElementByName('tachiePosition');
  //   if (posElement) {
  //     posElement.value = value;
  //   }
  // }

// ーーーリリィ互換：シート側も imageIdentifier を全て取得ーーー

get tachieElements(): DataElement[] {
    if (!this.tabletopObject || !this.tabletopObject.imageDataElement) return [];
    // リリィ互換：imageDataElement 直下にある 'imageIdentifier' 要素をすべて取得
    return this.tabletopObject.imageDataElement.children.filter(e => (e as DataElement).name === 'imageIdentifier') as DataElement[];
  }
// --- START: 立ち絵とコマ画像の切り離し (1/3) ---
  // get tachieElements(): DataElement[] {
  //   if (!this.tabletopObject || !this.tabletopObject.imageDataElement) return [];
  //   // 独立した tachie フォルダからのみ画像を取得するよう修正
  //   let root = this.tabletopObject.imageDataElement.getFirstElementByName('tachie');
  //   return root ? (root.children as DataElement[]).filter(e => e.type === 'image') : [];
  // }


  getTachieUrl(identifier: string | number): string {
    const image = ImageStorage.instance.get(identifier ? identifier.toString() : '');
    return image ? image.url : '';
  }

  get iconIndex(): number {
    if (!this.tabletopObject || !this.tabletopObject.detailDataElement) return 0;
    let root = this.tabletopObject.detailDataElement.getFirstElementByName('コマ画像');
    if (!root) return 0;
    let indexElement = root.getFirstElementByName('ICON');
    if (!indexElement) return 0;
    return indexElement.currentValue !== undefined ? Number(indexElement.currentValue) : Number(indexElement.value);
  }

  set iconIndex(value: number) {
    if (!this.tabletopObject || !this.tabletopObject.detailDataElement) return;
    let root = this.tabletopObject.detailDataElement.getFirstElementByName('コマ画像');
    if (!root) {
      root = DataElement.create('コマ画像', '', {}, 'コマ画像_' + this.tabletopObject.identifier);
      this.tabletopObject.detailDataElement.appendChild(root);
    }
    
    // コマ画像の最大値は、現在の立ち絵リストの長さに追従する
    let maxIcon = Math.max(0, this.tachieElements.length - 1);
    let indexElement = root.getFirstElementByName('ICON');
    
    if (!indexElement) {
      indexElement = DataElement.create('ICON', maxIcon, { type: 'numberResource', currentValue: value.toString() }, 'ICON_' + this.tabletopObject.identifier);
      root.appendChild(indexElement);
    } else {
      // 現在値を更新し、最大値を立ち絵リストの数に合わせる
      indexElement.currentValue = value;
      indexElement.value = maxIcon;
    }
    
    if (this.tabletopObject) this.tabletopObject.update();
  }
// // --- START: スライダー操作時に盤面の表示を即座に更新する修正 ---
//   get iconIndex(): number {
//     const root = this.tachieRootElement;
//     if (!root) return 0;
//     const indexElement = root.getFirstElementByName('iconIndex');
//     return indexElement ? Number(indexElement.value) : 0;
//   }

//   set iconIndex(value: number) {
//     const root = this.tachieRootElement;
//     if (root) {
//       let indexElement = root.getFirstElementByName('iconIndex');
//       if (!indexElement) {
//         indexElement = DataElement.create('iconIndex', 0, { type: 'number' });
//         root.appendChild(indexElement);
//       }
//       indexElement.value = value;
      
//       // スライダーの値を書き換えた後、キャラクター本体に更新を通知します。
//       // これにより、盤面上のコマが imageFile を読み直し、表示が即座に反映されます。
//       if (this.tabletopObject) this.tabletopObject.update();
//     }
//   }
// --- END ---


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
          // ここでの同期処理（0番目なら盤面も変える等）を削除し、完全に独立させます
        } else {
          this.addTachieImage(event.data.fileIdentifier);
        }
      }
      EventSystem.unregister(this, 'SELECT_FILE');
    });
  }
// --- END ---
//   set iconIndex(index: number) {
//     if (this.tachieElements.length > index && this.tabletopObject) {
//       const imageElement = this.tabletopObject.imageDataElement?.getFirstElementByName('imageIdentifier');
//       if (imageElement) {
//         imageElement.value = this.tachieElements[index].value;
//       }
//     }
//   }

//   // ーーー変更2：画像変更時に、0番目ならコマ画像も同期するーーー
// // --- START: 立ち絵とコマ画像の切り離し (2/3) ---
//   openTachieImageModal(targetTachie?: DataElement) {
//     this.panelService.open(FileSelecterComponent, {
//       width: 400,
//       height: 600,
//       title: targetTachie ? '画像の変更' : '立ち絵画像の追加'
//     });

//     EventSystem.unregister(this, 'SELECT_FILE');
//     EventSystem.register(this).on('SELECT_FILE', event => {
//       if (event.data && event.data.fileIdentifier) {
//         if (targetTachie) {
//           targetTachie.value = event.data.fileIdentifier;
          
//           // 変更した立ち絵が0番目（基本画像）だった場合、盤面のコマ画像も同期する
//           if (this.tachieElements.indexOf(targetTachie) === 0) {
//             const baseImage = this.tabletopObject.imageDataElement?.getFirstElementByName('imageIdentifier');
//             if (baseImage) baseImage.value = event.data.fileIdentifier;
//           }
//         } else {
//           this.addTachieImage(event.data.fileIdentifier);
//         }
//       }
//       EventSystem.unregister(this, 'SELECT_FILE');
//     });
//   }




// ーーーリリィ互換：立ち絵の追加処理ーーー

// --- START: リリィ互換形式での立ち絵追加・削除 ---
  private addTachieImage(identifier: string) {
    if (!this.tabletopObject || !this.tabletopObject.imageDataElement) return;
    
    const imageRoot = this.tabletopObject.imageDataElement;
    
    // リリィ互換：imageDataElement 直下に 'imageIdentifier' という名前の要素を追加
    let newTachie = new DataElement();
    newTachie.name = 'imageIdentifier';
    newTachie.currentValue = '差分' + this.tachieElements.length;
    newTachie.value = identifier;
    newTachie.type = 'image';
    imageRoot.appendChild(newTachie);
  }

  removeTachieImage(element: DataElement) {
    if (this.tabletopObject && this.tabletopObject.imageDataElement) {
      this.tabletopObject.imageDataElement.removeChild(element);
    }
  }
// --- START: 立ち絵追加時に専用フォルダと0番目を自動生成 ---
  // private addTachieImage(identifier: string) {
  //   let root = this.tabletopObject.imageDataElement.getFirstElementByName('tachie');
    
  //   // 初回のみ：tachieフォルダを作り、現在のコマ画像を「基本画像」として0番目に確保する
  //   if (!root) {
  //     root = new DataElement();
  //     root.name = 'tachie';
  //     root.type = 'image';
  //     this.tabletopObject.imageDataElement.appendChild(root);
      
  //     let baseImage = this.tabletopObject.imageDataElement.getFirstElementByName('imageIdentifier');
  //     if (baseImage && baseImage.value) {
  //       let defaultTachie = new DataElement();
  //       defaultTachie.name = 'imageIdentifier';
  //       defaultTachie.currentValue = '基本画像';
  //       defaultTachie.value = baseImage.value;
  //       defaultTachie.type = 'image';
  //       root.appendChild(defaultTachie);
  //     }
  //   }
    
  //   // 選択された新しい差分を追加する
  //   let newTachie = new DataElement();
  //   newTachie.name = 'imageIdentifier';
  //   newTachie.currentValue = '差分' + root.children.length;
  //   newTachie.value = identifier;
  //   newTachie.type = 'image';
  //   root.appendChild(newTachie);
  // }

  // removeTachieImage(element: DataElement) {
  //   let root = this.tabletopObject.imageDataElement.getFirstElementByName('tachie');
  //   if (root) root.removeChild(element);
  // }
// --- END ---
}