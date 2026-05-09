import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component,
  ElementRef, HostListener, Input, NgZone, OnChanges, OnDestroy
} from '@angular/core';
import { animate, keyframes, style, transition, trigger } from '@angular/animations';
import { ImageFile } from '@udonarium/core/file-storage/image-file';
import { EventSystem, Network } from '@udonarium/core/system';
import { MathUtil } from '@udonarium/core/system/util/math-util';
import { GameTableMask } from '@udonarium/game-table-mask';
import { PresetSound, SoundEffect } from '@udonarium/sound-effect';
import { GameCharacterSheetComponent } from 'component/game-character-sheet/game-character-sheet.component';
import { InputHandler } from 'directive/input-handler';
import { MovableOption } from 'directive/movable.directive';
import { ContextMenuAction, ContextMenuSeparator, ContextMenuService } from 'service/context-menu.service';
import { CoordinateService } from 'service/coordinate.service';
import { PanelOption, PanelService } from 'service/panel.service';
import { PointerDeviceService } from 'service/pointer-device.service';
import { TabletopActionService } from 'service/tabletop-action.service';
import { SelectionState, TabletopSelectionService } from 'service/tabletop-selection.service';

@Component({
  selector: 'game-table-mask',
  templateUrl: './game-table-mask.component.html',
  styleUrls: ['./game-table-mask.component.css'],
  animations: [
    trigger('fadeInOut', [
      transition('void => *', [animate('132ms ease-out', keyframes([style({ opacity: 0, offset: 0 }), style({ opacity: 1, offset: 1.0 })]))]),
      transition('* => void', [animate('132ms ease-in', keyframes([style({ opacity: 1, offset: 0 }), style({ opacity: 0, offset: 1.0 })]))])
    ]),
    trigger('rotateInOut', [
      transition('scrached<=>restore', [animate('132ms ease-in-out', keyframes([style({ transform: 'rotateY(0deg)', offset: 0.0 }), style({ transform: 'rotateY(-90deg)', offset: 1.0 })]))])
    ]),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameTableMaskComponent implements OnChanges, OnDestroy, AfterViewInit {
  @Input() gameTableMask: GameTableMask = null;
  @Input() is3D: boolean = false;

  get name(): string { return this.gameTableMask.name; }
  get width(): number { return MathUtil.clampMin(this.gameTableMask.width); }
  get height(): number { return MathUtil.clampMin(this.gameTableMask.height); }
  get opacity(): number { return this.gameTableMask.opacity; }
  get imageFile(): ImageFile { return this.gameTableMask.imageFile; }
  get isLock(): boolean { return this.gameTableMask.isLock; }
  set isLock(isLock: boolean) { this.gameTableMask.isLock = isLock; }

  get selectionState(): SelectionState { return this.selectionService.state(this.gameTableMask); }
  get isSelected(): boolean { return this.selectionState !== SelectionState.NONE; }
  get isMagnetic(): boolean { return this.selectionState === SelectionState.MAGNETIC; }

  get dispLockMark(): boolean { return this.gameTableMask.dispLockMark; }
  set dispLockMark(disp: boolean) { this.gameTableMask.dispLockMark = disp; }
  get altitude(): number { return this.gameTableMask.altitude; }
  set altitude(altitude: number) { this.gameTableMask.altitude = altitude; }
  get isAltitudeIndicate(): boolean { return this.gameTableMask.isAltitudeIndicate; }
  set isAltitudeIndicate(isAltitudeIndicate: boolean) { this.gameTableMask.isAltitudeIndicate = isAltitudeIndicate; }
  get gameTableMaskAltitude(): number { return +this.altitude.toFixed(1); }
  get isDragging(): boolean { return this.pointerDeviceService.isDragging; }

  // ▼▼▼ 追加：スクラッチ機能用プロパティ ▼▼▼
  get isPreview(): boolean { return this.gameTableMask.isPreview; }
  set isPreview(isPreview: boolean) { this.gameTableMask.isPreview = isPreview; }
  get isPreviewMode(): boolean { return this.gameTableMask ? (this.isPreview && this.gameTableMask.isMine) : false; }
  get scratchedGrids() { return this.gameTableMask.scratchedGrids; }
  set scratchedGrids(val: string) { this.gameTableMask.scratchedGrids = val; }
  get scratchingGrids() { return this.gameTableMask.scratchingGrids; }
  set scratchingGrids(val: string) { this.gameTableMask.scratchingGrids = val; }

  get isNonScratched(): boolean { return !this.gameTableMask.scratchedGrids; }
  get isNonScratching(): boolean { return !(this.gameTableMask.scratchingGrids || this._currentScratchingSet); }
  get isScratching(): boolean { return !!this.gameTableMask.owner; }
  get ownerIsOnline(): boolean { return this.gameTableMask.ownerIsOnline; }
  get ownerName(): string { return this.gameTableMask.ownerName; }

  get operateOpacity(): number {
    const ret = this.opacity * ((this.gameTableMask.isMine) ? 0.6 : 1);
    return (ret < 0.4 && this.isScratching) ? 0.4 : ret;
  }

  get masksCss(): string {
    if (!this.isPreviewMode && this.isNonScratched) return '';
    const masks: string[] = [];
    const scratchedSet: Set<string> = new Set((this.scratchedGrids || '').split(/,/g));
    const scratchingSet: Set<string> = this._currentScratchingSet ? this._currentScratchingSet : new Set((this.scratchingGrids || '').split(/,/g));
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        const gridStr = `${x}:${y}`;
        if (this.isPreviewMode) {
          if (scratchedSet.has(gridStr) && !scratchingSet.has(gridStr)) continue;
          if (scratchingSet.has(gridStr) && !scratchedSet.has(gridStr)) continue;
        } else {
          if (scratchedSet.has(gridStr)) continue;
        }
        masks.push(`radial-gradient(#000, #000) ${ x * this.gridSize - 1 }px ${ y * this.gridSize -1 }px / ${ this.gridSize + 2 }px ${ this.gridSize + 2 }px no-repeat`);
      }
    }
    return masks.length ? masks.join(',') : 'radial-gradient(#000, #000) 0px 0px / 0px 0px no-repeat';
  }

  get scratchingGridInfos(): {x: number, y: number, state: string}[] {
    const ret: {x: number, y: number, state: string}[] = [];
    if (!this.gameTableMask || (this.isNonScratching && this.isNonScratched)) return ret;
    const scratchingGridSet: Set<string> = this._currentScratchingSet ? this._currentScratchingSet : new Set((this.scratchingGrids || '').split(/,/g));
    const scratchedGridSet: Set<string> = new Set((this.scratchedGrids || '').split(/,/g));
    for (let x = 0; x < Math.ceil(this.width); x++) {
      for (let y = 0; y < Math.ceil(this.height); y++) {
        const gridStr = `${x}:${y}`;
        if (scratchingGridSet.has(gridStr) || scratchedGridSet.has(gridStr)) {
          ret.push({ 
            x: x, y: y, 
            state: !scratchingGridSet.has(gridStr) ? 'scrached' : !scratchedGridSet.has(gridStr) ? 'scraching' : 'restore'
          });
        }
      }
    }
    return ret;
  }
  // ▲▲▲ スクラッチ機能用プロパティここまで ▲▲▲

  math = Math;
  viewRotateZ = 10;
  gridSize: number = 50;
  movableOption: MovableOption = {};
  private input: InputHandler = null;

  // スクラッチ内部状態管理
  private _currentScratchingSet: Set<string>;
  private _scratchingTimerId;
  private _scratchingGridX = -1;
  private _scratchingGridY = -1;

  constructor(
    private ngZone: NgZone,
    private tabletopActionService: TabletopActionService,
    private contextMenuService: ContextMenuService,
    private elementRef: ElementRef<HTMLElement>,
    private panelService: PanelService,
    private changeDetector: ChangeDetectorRef,
    private selectionService: TabletopSelectionService,
    private pointerDeviceService: PointerDeviceService,
    private coordinateService: CoordinateService,
  ) { }

  ngOnChanges(): void {
    EventSystem.unregister(this);
    EventSystem.register(this)
      .on<object>('TABLE_VIEW_ROTATE', -1000, event => {
        this.ngZone.run(() => {
          this.viewRotateZ = event.data['z'];
          this.changeDetector.markForCheck();
        });
      })
      .on(`UPDATE_GAME_OBJECT/identifier/${this.gameTableMask?.identifier}`, event => {
        this.changeDetector.markForCheck();
      })
      .on(`UPDATE_OBJECT_CHILDREN/identifier/${this.gameTableMask?.identifier}`, event => {
        this.changeDetector.markForCheck();
      })
      .on('SYNCHRONIZE_FILE_LIST', event => {
        this.changeDetector.markForCheck();
      })
      .on('UPDATE_FILE_RESOURE', event => {
        this.changeDetector.markForCheck();
      })
      .on(`UPDATE_SELECTION/identifier/${this.gameTableMask?.identifier}`, event => {
        this.changeDetector.markForCheck();
      });

    this.movableOption = {
      tabletopObject: this.gameTableMask,
      transformCssOffset: 'translateZ(0.15px)',
      colideLayers: ['terrain']
      //colideLayers: [] // ★重要：地形衝突を無効化。これでマスク同士が重なっても浮かなくなります。
    };
  }

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => {
      this.input = new InputHandler(this.elementRef.nativeElement);
    });
    // ▼ Angularパフォーマンス改善：HostListenerではなくInputHandler内で全て処理する
    this.input.onStart = this.onInputStart.bind(this);
    this.input.onMove = this.onInputMove.bind(this);
  }

  ngOnDestroy() {
    this.input.destroy();
    EventSystem.unregister(this);
    clearTimeout(this._scratchingTimerId);
  }

  @HostListener('dragstart', ['$event'])
  onDragstart(e) {
    e.stopPropagation();
    e.preventDefault();
  }

  onInputStart(e: any) {
    if (this.isScratching && this.gameTableMask.isMine) {
      // スクラッチモードの時は削る処理へ
      this.scratching(true);
    } else {
      this.input.cancel();
      if (this.isLock) {
        EventSystem.trigger('DRAG_LOCKED_OBJECT', { srcEvent: e });
      }
    }
  }

  onInputMove(e: any) {
    if (this.isScratching && this.gameTableMask.isMine && this.input.isDragging) {
      this.scratching(false);
    }
  }

  scratching(isStart: boolean) {
    if (!this.gameTableMask.isMine) return;

    const scratchingPosition = this.coordinateService.calcTabletopLocalCoordinate(this.pointerDeviceService.pointers[0], this.elementRef.nativeElement);
    const offsetX = scratchingPosition.x - this.gameTableMask.location.x;
    const offsetY = scratchingPosition.y - this.gameTableMask.location.y;

    if (offsetX < 0 || this.gameTableMask.width * this.gridSize <= offsetX || offsetY < 0 || this.gameTableMask.height * this.gridSize <= offsetY) return;
    const gridX = Math.floor(offsetX / this.gridSize);
    const gridY = Math.floor(offsetY / this.gridSize);

    if (!isStart && this._scratchingGridX === gridX && this._scratchingGridY === gridY) return;
    const tempScratching = `${gridX}:${gridY}`;
    this._scratchingGridX = gridX;
    this._scratchingGridY = gridY;

    if (!this._currentScratchingSet) this._currentScratchingSet = new Set((this.scratchingGrids || '').split(/,/g));
    
    if (this._currentScratchingSet.has(tempScratching)) {
      this._currentScratchingSet.delete(tempScratching);
    } else {
      this._currentScratchingSet.add(tempScratching);
    }

    // 画面の再描画を即時反映させる
    this.ngZone.run(() => { this.changeDetector.markForCheck(); });

    clearTimeout(this._scratchingTimerId);
    this._scratchingTimerId = setTimeout(() => {
      this.scratchingGrids = Array.from(this._currentScratchingSet).filter(grid => grid && /^\d+:\d+$/.test(grid)).sort().join(',');
      this._currentScratchingSet = null;
    }, 250);
  }

  scratched() {
    const currentScratchedAry: string[] = (this.scratchedGrids || '').split(/,/g);
    if (this._currentScratchingSet) {
      clearTimeout(this._scratchingTimerId);
      this.scratchingGrids = Array.from(this._currentScratchingSet).filter(grid => grid && /^\d+:\d+$/.test(grid)).sort().join(',');
      this._currentScratchingSet = null;
    }
    const currentScratchingAry: string[] = (this.scratchingGrids || '').split(/,/g);
    
    // xor 処理と同等のフィルタリング
    const combined = currentScratchedAry.concat(currentScratchingAry);
    const result = combined.filter((item, pos) => combined.indexOf(item) === combined.lastIndexOf(item));

    this.scratchedGrids = result.filter(grid => grid && /^\d+:\d+$/.test(grid)).sort().join(',');
  }

  scratchDone(e: Event=null) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!this.gameTableMask.isMine) return false;
    this.ngZone.run(() => {
      this.scratched();
      this.gameTableMask.owner = '';
      this.scratchingGrids = '';
      this.isPreview = false;
    });
    this._scratchingGridX = -1;
    this._scratchingGridY = -1;
    SoundEffect.play(PresetSound.cardPut);
    return false;
  }

  scratchCancel(e: Event=null) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!this.gameTableMask.isMine && this.ownerIsOnline) return false;
    this.ngZone.run(() => {
      this.gameTableMask.owner = '';
      this.scratchingGrids = '';
      this.isPreview = false;
    });
    this._scratchingGridX = -1;
    this._scratchingGridY = -1;
    SoundEffect.play(PresetSound.unlock);
    return false;
  }

  prevent(e) { e.preventDefault(); e.stopPropagation(); }

  @HostListener('contextmenu', ['$event'])
  onContextMenu(e: Event) {
    e.stopPropagation();
    e.preventDefault();

    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;
    let menuPosition = this.pointerDeviceService.pointers[0];
    let menuArray = this.makeContextMenu();
    this.contextMenuService.open(menuPosition, menuArray, this.name);
  }

  onMove() {
    this.contextMenuService.close();
    SoundEffect.play(PresetSound.cardPick);
  }

  onMoved() {
    SoundEffect.play(PresetSound.cardPut);
  }

  private makeContextMenu(): ContextMenuAction[] {
    let objectPosition = this.coordinateService.calcTabletopLocalCoordinate();
    let actions: ContextMenuAction[] = [];

    actions.push({
      name: '高度設定', action: null, subActions: [
        { name: '高度を0にする', action: () => { if (this.altitude != 0) { this.altitude = 0; SoundEffect.play(PresetSound.sweep); } },
        //高度の数値を設定する場所
      altitudeHande: this.gameTableMask },
        (this.isAltitudeIndicate
          ? { name: '☑ 高度の表示', action: () => { this.isAltitudeIndicate = false; SoundEffect.play(PresetSound.sweep); EventSystem.trigger('UPDATE_INVENTORY', null); } }
          : { name: '☐ 高度の表示', action: () => { this.isAltitudeIndicate = true; SoundEffect.play(PresetSound.sweep); EventSystem.trigger('UPDATE_INVENTORY', null); } })
      ]
    });
    actions.push(ContextMenuSeparator);

    actions.push((this.isLock
      ? { name: '固定解除', action: () => { this.isLock = false; this.dispLockMark = true; SoundEffect.play(PresetSound.unlock); } }
      : { name: '固定する', action: () => { this.isLock = true; SoundEffect.play(PresetSound.lock); } }
    ));

    if (this.isLock) {
      actions.push(this.dispLockMark
        ? { name: '固定マーク消去', action: () => { this.dispLockMark = false; SoundEffect.play(PresetSound.lock); } }
        : { name: '固定マーク表示', action: () => { this.dispLockMark = true; SoundEffect.play(PresetSound.lock); } }
      );
    } else {
      actions.push(ContextMenuSeparator);
      actions.push({ name: '重なり順を一番上に', action: () => { let parent = this.gameTableMask.parent; if (parent) parent.appendChild(this.gameTableMask); } });
      actions.push({ name: '重なり順を一番下に', action: () => { let parent = this.gameTableMask.parent; if (parent) parent.prependChild(this.gameTableMask); } });
    }

    // ▼ スクラッチ関連のメニュー追加 ▼
    actions.push(ContextMenuSeparator);
    if (!this.gameTableMask.isMine) {
      actions.push({
        name: 'スクラッチ開始', action: () => {
          if (this.gameTableMask.owner != '') {
            this.isPreview = false;
            clearTimeout(this._scratchingTimerId);
            this._currentScratchingSet = null;
          }
          SoundEffect.play(PresetSound.cardDraw);
          this.gameTableMask.owner = Network.peer.userId;
          this._scratchingGridX = -1;
          this._scratchingGridY = -1;
          SoundEffect.play(PresetSound.lock);
        }
      });
    } else {
      actions.push({ name: 'スクラッチ確定', action: () => { this.scratchDone(); } });
      actions.push({ name: 'スクラッチキャンセル', action: () => { this.scratchCancel(); } });
    }
    // ▲ スクラッチメニューここまで ▲

    actions.push(ContextMenuSeparator);
    actions.push({ name: 'マップマスクを編集', action: () => { this.showDetail(this.gameTableMask); } });
    actions.push({
      name: 'コピーを作る', action: () => {
        let cloneObject = this.gameTableMask.clone();
        cloneObject.location.x += this.gridSize;
        cloneObject.location.y += this.gridSize;
        cloneObject.isLock = false;
        if (this.gameTableMask.parent) this.gameTableMask.parent.appendChild(cloneObject);
        SoundEffect.play(PresetSound.cardPut);
      }
    });
    actions.push({
      name: '削除する', action: () => {
        this.gameTableMask.destroy();
        SoundEffect.play(PresetSound.sweep);
      }
    });
    actions.push(ContextMenuSeparator);
    actions.push({ name: 'オブジェクト作成', action: null, subActions: this.tabletopActionService.makeDefaultContextMenuActions(objectPosition) });
    return actions;
  }

  private showDetail(gameObject: GameTableMask) {
    let coordinate = this.pointerDeviceService.pointers[0];
    let title = 'マップマスク設定';
    if (gameObject.name.length) title += ' - ' + gameObject.name;
    let option: PanelOption = { title: title, left: coordinate.x - 200, top: coordinate.y - 150, width: 400, height: 300 };
    let component = this.panelService.open<GameCharacterSheetComponent>(GameCharacterSheetComponent, option);
    component.tabletopObject = gameObject;
  }
}