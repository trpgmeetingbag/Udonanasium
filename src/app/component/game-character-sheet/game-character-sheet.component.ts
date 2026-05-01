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
import { GameCharacter } from '@udonarium/game-character';

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

      if (name === 'imageIdentifier') {
        let tachies = this.tachieElements;
        if (tachies.length > 0) {
          tachies[0].value = value;
        }
      }
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

// === ↓ 修正ポイント（Lily仕様のプロパティアクセス ＋ 過去の即時反映ロジックの復活） ↓ ===
  get disableChat(): boolean {
    if (!this.tabletopObject) return false;
    return (this.tabletopObject as GameCharacter).nonTalkFlag;
  }

  set disableChat(value: boolean) {
    if (!this.tabletopObject) return;
    let character = this.tabletopObject as GameCharacter;
    character.nonTalkFlag = value;
    
    // 強制同期用のダミーカウンターを加算し、キャラクターの更新をネットワークに通知
    character.syncDummyCounter++;
    character.update();
  }

  get hideInTableInventory(): boolean {
    if (!this.tabletopObject) return false;
    return (this.tabletopObject as GameCharacter).hideInventory;
  }

  set hideInTableInventory(value: boolean) {
    if (!this.tabletopObject) return;
    let character = this.tabletopObject as GameCharacter;
    character.hideInventory = value;
    
    // 強制同期用のダミーカウンターを加算し、キャラクターの更新をネットワークに通知
    character.syncDummyCounter++;
    character.update();
    
    // インベントリ画面のUIに「再描画せよ」というイベントを直接飛ばす（過去の大正解ロジック）
    EventSystem.trigger('UPDATE_INVENTORY', null);
  }
  // === ↑ 修正ポイント ↑ ===

  get tachiePosition(): number {
    if (!this.tabletopObject || !this.tabletopObject.detailDataElement) return 0;
    let root = this.tabletopObject.detailDataElement.getFirstElementByName('立ち絵位置');
    if (!root) return 0;
    let posElement = root.getFirstElementByName('POS');
    if (!posElement) return 0;
    return posElement.currentValue !== undefined ? Number(posElement.currentValue) : Number(posElement.value);
  }

  set tachiePosition(value: number) {
    if (!this.tabletopObject || !this.tabletopObject.detailDataElement) return;
    let root = this.tabletopObject.detailDataElement.getFirstElementByName('立ち絵位置');
    if (!root) {
      root = DataElement.create('立ち絵位置', '', {}, '立ち絵位置_' + this.tabletopObject.identifier);
      this.tabletopObject.detailDataElement.appendChild(root);
    }
    let posElement = root.getFirstElementByName('POS');
    if (!posElement) {
      posElement = DataElement.create('POS', 11, { type: 'numberResource', currentValue: value.toString() }, 'POS_' + this.tabletopObject.identifier);
      root.appendChild(posElement);
    } else {
      posElement.currentValue = value;
      posElement.value = 11; 
    }
  }

  get tachieElements(): DataElement[] {
    if (!this.tabletopObject || !this.tabletopObject.imageDataElement) return [];
    return this.tabletopObject.imageDataElement.children.filter(e => (e as DataElement).name === 'imageIdentifier') as DataElement[];
  }

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
    
    let maxIcon = Math.max(0, this.tachieElements.length - 1);
    let indexElement = root.getFirstElementByName('ICON');
    
    if (!indexElement) {
      indexElement = DataElement.create('ICON', maxIcon, { type: 'numberResource', currentValue: value.toString() }, 'ICON_' + this.tabletopObject.identifier);
      root.appendChild(indexElement);
    } else {
      indexElement.currentValue = value;
      indexElement.value = maxIcon;
    }
    
    if (this.tabletopObject) this.tabletopObject.update();
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

  // private addTachieImage(identifier: string) {
  //   if (!this.tabletopObject || !this.tabletopObject.imageDataElement) return;
  //   const imageRoot = this.tabletopObject.imageDataElement;
  //   let newTachie = new DataElement();
  //   newTachie.name = 'imageIdentifier';
  //   newTachie.currentValue = '差分' + this.tachieElements.length;
  //   newTachie.value = identifier;
  //   newTachie.type = 'image';
  //   imageRoot.appendChild(newTachie);
  // }
private addTachieImage(identifier: string) {
    if (!this.tabletopObject || !this.tabletopObject.imageDataElement) return;
    const imageRoot = this.tabletopObject.imageDataElement;
    
    // UUIDを付与して、ネットワーク同期・保存対象として正しく生成する
    let newTachie: DataElement = DataElement.create(
      'imageIdentifier', 
      identifier, 
      { 'type': 'image', 'currentValue': '差分' + this.tachieElements.length }, 
      'imageIdentifier_' + identifier + '_' + Date.now() // ユニークなID
    );
    
    imageRoot.appendChild(newTachie);
    
    // 強制的に状態更新を通知（保存漏れを防ぐため）
    if (this.tabletopObject) this.tabletopObject.update();
  }


  removeTachieImage(element: DataElement) {
    if (this.tabletopObject && this.tabletopObject.imageDataElement) {
      this.tabletopObject.imageDataElement.removeChild(element);
    }
  }

  chkKomaSize(height: number) {
    let character = <GameCharacter>this.tabletopObject;
    if (height < 50) height = 50;
    if (height > 750) height = 750;
    character.komaImageHeignt = height;
  }

  chkPopWidth(width: number) {
    let character = <GameCharacter>this.tabletopObject;
    if (width < 270) width = 270;
    if (width > 1000) width = 1000;
    character.overViewWidth = width;
  }

  chkPopMaxHeight(maxHeight: number) {
    let character = <GameCharacter>this.tabletopObject;
    if (maxHeight < 250) maxHeight = 250;
    if (maxHeight > 1000) maxHeight = 1000;
    character.overViewMaxHeight = maxHeight;
  }

  clickLimitHeight() {
    setTimeout(() => { 
      EventSystem.trigger('RESIZE_NOTE_OBJECT', { identifier: this.tabletopObject.identifier });
    }, 100);
  }

  chkNotePopWidth(width: number) {
    let note = this.tabletopObject as any; 
    if (width < 250) width = 250;
    if (width > 1000) width = 1000;
    note.overViewWidth = width;
  }

  chkNotePopMaxHeight(maxHeight: number) {
    let note = this.tabletopObject as any;
    if (maxHeight < 250) maxHeight = 250;
    if (maxHeight > 1000) maxHeight = 1000;
    note.overViewMaxHeight = maxHeight;
  }

  chkCardPopWidth(width: number) {
    let card = this.tabletopObject as any; 
    if (width < 250) width = 250;
    if (width > 1000) width = 1000;
    card.overViewWidth = width;
  }

  chkCardPopMaxHeight(maxHeight: number) {
    let card = this.tabletopObject as any; 
    if (maxHeight < 250) maxHeight = 250;
    if (maxHeight > 1000) maxHeight = 1000;
    card.overViewMaxHeight = maxHeight;
  }
}