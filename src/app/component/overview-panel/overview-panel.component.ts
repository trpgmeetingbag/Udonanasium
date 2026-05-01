import { animate, keyframes, style, transition, trigger } from '@angular/animations';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild
} from '@angular/core';
import { EventSystem } from '@udonarium/core/system';
import { DataElement } from '@udonarium/data-element';
import { TabletopObject } from '@udonarium/tabletop-object';
import { GameObjectInventoryService } from 'service/game-object-inventory.service';
import { PointerDeviceService } from 'service/pointer-device.service';
import { GameCharacter } from '@udonarium/game-character';

@Component({
  selector: 'overview-panel',
  templateUrl: './overview-panel.component.html',
  styleUrls: ['./overview-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('fadeInOut', [
      transition('void => *', [
        animate('100ms ease-out', keyframes([
          style({ opacity: 0, offset: 0 }),
          style({ opacity: 1, offset: 1.0 })
        ]))
      ]),
      transition('* => void', [
        animate('100ms ease-in', keyframes([
          style({ opacity: 1, offset: 0 }),
          style({ opacity: 0, offset: 1.0 })
        ]))
      ])
    ])
  ]
})
export class OverviewPanelComponent implements OnChanges, AfterViewInit, OnDestroy {
  @ViewChild('draggablePanel', { static: true }) draggablePanel: ElementRef<HTMLElement>;
  @Input() tabletopObject: TabletopObject = null;

  @Input() left: number = 0;
  @Input() top: number = 0;

  get imageUrl(): string { return this.tabletopObject && this.tabletopObject.imageFile ? this.tabletopObject.imageFile.url : ''; }
  get hasImage(): boolean { return 0 < this.imageUrl.length; }

  get inventoryDataElms(): DataElement[] { return this.tabletopObject ? this.getInventoryTags(this.tabletopObject) : []; }
  get dataElms(): DataElement[] { return this.tabletopObject && this.tabletopObject.detailDataElement ? this.tabletopObject.detailDataElement.children as DataElement[] : []; }
  get hasDataElms(): boolean { return 0 < this.dataElms.length; }

  get newLineDataElement(): DataElement { return this.inventoryService.newLineDataElement; }
  get isPointerDragging(): boolean { return this.pointerDeviceService.isDragging || this.pointerDeviceService.isTablePickGesture; }

  get pointerEventsStyle(): any { return { 'is-pointer-events-auto': !this.isPointerDragging, 'pointer-events-none': this.isPointerDragging }; }

  isOpenImageView: boolean = false;

  constructor(
    private inventoryService: GameObjectInventoryService,
    private changeDetector: ChangeDetectorRef,
    private pointerDeviceService: PointerDeviceService
  ) { }

  ngOnChanges(): void {
    EventSystem.unregister(this);
    EventSystem.register(this)
      .on(`UPDATE_GAME_OBJECT/identifier/${this.tabletopObject?.identifier}`, event => {
        this.changeDetector.markForCheck();
      })
      .on(`UPDATE_OBJECT_CHILDREN/identifier/${this.tabletopObject?.identifier}`, event => {
        this.changeDetector.markForCheck();
      })
      .on('SYNCHRONIZE_FILE_LIST', event => {
        this.changeDetector.markForCheck();
      })
      .on('UPDATE_FILE_RESOURE', event => {
        this.changeDetector.markForCheck();
      });
  }

  ngAfterViewInit() {
    this.initPanelPosition();
    setTimeout(() => {
      this.adjustPositionRoot();
    }, 16);
  }

  ngOnDestroy() {
    EventSystem.unregister(this);
  }

  @HostListener('document:draggingstate', ['$event'])
  onChangeDragging(e: Event) {
    this.changeDetector.markForCheck();
  }

  // --- START: リリィ互換 ポップアップサイズ取得 ---
  get overViewCharacterWidth(): number {
    if (!this.tabletopObject || this.tabletopObject.aliasName !== 'character') return 270;
    let character = this.tabletopObject as GameCharacter;
    let width = character.overViewWidth;
    if (width < 270) width = 270;
    if (width > 1000) width = 1000;
    return width;
  }

  get overViewCharacterMaxHeight(): number {
    if (!this.tabletopObject || this.tabletopObject.aliasName !== 'character') return 250;
    let character = this.tabletopObject as GameCharacter;
    let maxHeight = character.overViewMaxHeight;
    if (maxHeight < 250) maxHeight = 250;
    if (maxHeight > 1000) maxHeight = 1000;
    return maxHeight;
  }
  // --- END ---

// --- START: カード・山札用ポップアップサイズ取得 ---
  get overViewCardWidth(): number {
    if (!this.tabletopObject) return 250;
    let card = this.tabletopObject as any;
    let width = card.overViewWidth || 250;
    if (width < 250) width = 250;
    if (width > 1000) width = 1000;
    return width;
  }

  get overViewCardWidthNoMargin(): number {
    if (this.hasImage) return this.overViewCardWidth - 60 - 12 - 2;
    return this.overViewCardWidth - 12 - 2;
  }

  get overViewCardMaxHeight(): number {
    if (!this.tabletopObject) return 250;
    let card = this.tabletopObject as any;
    let maxHeight = card.overViewMaxHeight || 250;
    if (maxHeight < 250) maxHeight = 250;
    if (maxHeight > 1000) maxHeight = 1000;
    return maxHeight;
  }
  // --- END ---

  private initPanelPosition() {
    let panel: HTMLElement = this.draggablePanel.nativeElement;
    let outerWidth = panel.offsetWidth;
    let outerHeight = panel.offsetHeight;

    let offsetLeft = this.left + 100;
    let offsetTop = this.top - outerHeight - 50;

    let isCollideLeft = false;
    let isCollideTop = false;

    if (window.innerWidth < offsetLeft + outerWidth) {
      offsetLeft = window.innerWidth - outerWidth;
      isCollideLeft = true;
    }

    if (offsetTop <= 0) {
      offsetTop = 0;
      isCollideTop = true;
    }

    if (isCollideLeft) {
      offsetLeft = this.left - outerWidth - 100;
    }

    if (offsetLeft < 0) offsetLeft = 0;
    if (offsetTop < 0) offsetTop = 0;

    panel.style.left = offsetLeft + 'px';
    panel.style.top = offsetTop + 'px';
  }

  private adjustPositionRoot() {
    let panel: HTMLElement = this.draggablePanel.nativeElement;

    let panelBox = panel.getBoundingClientRect();

    let diffLeft = 0;
    let diffTop = 0;

    if (window.innerWidth < panelBox.right + diffLeft) {
      diffLeft += window.innerWidth - (panelBox.right + diffLeft);
    }
    if (panelBox.left + diffLeft < 0) {
      diffLeft += 0 - (panelBox.left + diffLeft);
    }

    if (window.innerHeight < panelBox.bottom + diffTop) {
      diffTop += window.innerHeight - (panelBox.bottom + diffTop);
    }
    if (panelBox.top + diffTop < 0) {
      diffTop += 0 - (panelBox.top + diffTop);
    }

    panel.style.left = panel.offsetLeft + diffLeft + 'px';
    panel.style.top = panel.offsetTop + diffTop + 'px';
  }

  chanageImageView(isOpen: boolean) {
    this.isOpenImageView = isOpen;
  }

  private getInventoryTags(gameObject: TabletopObject): DataElement[] {
    return this.inventoryService.tableInventory.dataElementMap.get(gameObject.identifier);
  }

  escapeHtml(text) {
    if (typeof text !== 'string') return text;
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  isEditUrl(dataElmIdentifier: string) {
    let box = <HTMLInputElement>document.getElementById(dataElmIdentifier);
    if (!box) return false;
    return box.checked;
  }
  
  isUrlText(text: any) {
    if (typeof text !== 'string') return false;
    if (text.match(/^https:\/\//)) return true;
    if (text.match(/^http:\/\//)) return true;
    return false;
  }
  
  changeChk() { }

  textFocus(dataElmIdentifier: string) {
    let box = <HTMLInputElement>document.getElementById(dataElmIdentifier);
    if (box) box.checked = true;
  }
}
