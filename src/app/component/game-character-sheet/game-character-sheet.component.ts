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

  openModal(name: string = '', isAllowedEmpty: boolean = false) {
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: isAllowedEmpty }).then(value => {
      if (!this.tabletopObject || !this.tabletopObject.imageDataElement || !value) return;
      let element = this.tabletopObject.imageDataElement.getFirstElementByName(name);
      if (!element) return;
      element.value = value;
    });
  }

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

  get tachieElements(): DataElement[] {
    const root = this.tachieRootElement;
    if (!root) return [];
    return (root.children as DataElement[]).filter(child => child.type === 'image');
  }

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
        } else {
          this.addTachieImage(event.data.fileIdentifier);
        }
      }
      EventSystem.unregister(this, 'SELECT_FILE');
    });
  }

  private addTachieImage(identifier: string) {
    const root = this.tachieRootElement;
    if (!root) return;
    const newTachie = new DataElement();
    newTachie.name = `差分${this.tachieElements.length}`;
    newTachie.value = identifier;
    newTachie.type = 'image';
    root.appendChild(newTachie);
  }

  removeTachieImage(element: DataElement) {
    const root = this.tachieRootElement;
    if (root) root.removeChild(element);
  }
}