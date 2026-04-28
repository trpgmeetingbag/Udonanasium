import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  ViewChild
} from '@angular/core';
import { ImageFile } from '@udonarium/core/file-storage/image-file';
import { EventSystem } from '@udonarium/core/system';
import { MathUtil } from '@udonarium/core/system/util/math-util';
import { PresetSound, SoundEffect } from '@udonarium/sound-effect';
import { GameCharacterSheetComponent } from 'component/game-character-sheet/game-character-sheet.component';
import { InputHandler } from 'directive/input-handler';
import { MovableOption } from 'directive/movable.directive';
import { RotableOption } from 'directive/rotable.directive';
import { ContextMenuAction, ContextMenuSeparator, ContextMenuService } from 'service/context-menu.service';
import { CoordinateService } from 'service/coordinate.service';
import { ImageService } from 'service/image.service';
import { PanelOption, PanelService } from 'service/panel.service';
import { PointerDeviceService } from 'service/pointer-device.service';
import { TabletopActionService } from 'service/tabletop-action.service';
import { SelectionState, TabletopSelectionService } from 'service/tabletop-selection.service';
import { Terrain, TerrainViewState, SlopeDirection } from '@udonarium/terrain';
import { GridLineRender } from 'component/game-table/grid-line-render';
import { GameTable } from '@udonarium/game-table';
import { ObjectStore } from '@udonarium/core/synchronize-object/object-store'; // ← 無ければ追加
import { TableSelecter } from '@udonarium/table-selecter';

@Component({
  selector: 'terrain',
  templateUrl: './terrain.component.html',
  styleUrls: ['./terrain.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TerrainComponent implements OnChanges, OnDestroy, AfterViewInit {
  @Input() terrain: Terrain = null;
  @Input() is3D: boolean = false;

  get name(): string { return this.terrain.name; }
  get mode(): TerrainViewState { return this.terrain.mode; }
  set mode(mode: TerrainViewState) { this.terrain.mode = mode; }

  get isLocked(): boolean { return this.terrain.isLocked; }
  set isLocked(isLocked: boolean) { this.terrain.isLocked = isLocked; }
  get hasWall(): boolean { return this.terrain.hasWall; }
  get hasFloor(): boolean { return this.terrain.hasFloor; }

  get wallImage(): ImageFile { return this.imageService.getSkeletonOr(this.terrain.wallImage); }
  get floorImage(): ImageFile { return this.imageService.getSkeletonOr(this.terrain.floorImage); }

  get height(): number { return MathUtil.clampMin(this.terrain.height); }
  get width(): number { return MathUtil.clampMin(this.terrain.width); }
  get depth(): number { return MathUtil.clampMin(this.terrain.depth); }

  get isVisibleFloor(): boolean { return 0 < this.width * this.depth; }
  get isVisibleWallTopBottom(): boolean { return 0 < this.width * this.height; }
  get isVisibleWallLeftRight(): boolean { return 0 < this.depth * this.height; }

  get selectionState(): SelectionState { return this.selectionService.state(this.terrain); }
  get isSelected(): boolean { return this.selectionState !== SelectionState.NONE; }
  get isMagnetic(): boolean { return this.selectionState === SelectionState.MAGNETIC; }

  gridSize: number = 50;

  // === ↓ ここから追加 ↓ ===

  private _isPointerDown = false;

  @HostListener('pointerdown', ['$event'])
  onPointerDown(e: PointerEvent) {
    this._isPointerDown = true;
    setTimeout(() => this.setGameTableGrid(), 0);
  }

  @HostListener('window:pointerup', ['$event'])
  onPointerUp(e: PointerEvent) {
    if (this._isPointerDown) {
      this._isPointerDown = false;
      setTimeout(() => this.setGameTableGrid(), 0);
    }
  }

  @ViewChild('gridCanvas', { static: false }) gridCanvas: ElementRef<HTMLCanvasElement>;
  get isGrid(): boolean { return this.terrain.isGrid; }
  set isGrid(isGrid: boolean) { this.terrain.isGrid = isGrid; }

  get altitude(): number { return this.terrain.altitude; }
  set altitude(altitude: number) { this.terrain.altitude = altitude; }

  get isDropShadow(): boolean { return this.terrain.isDropShadow; }
  set isDropShadow(isDropShadow: boolean) { this.terrain.isDropShadow = isDropShadow; }

  get isAltitudeIndicate(): boolean { return this.terrain.isAltitudeIndicate; }
  set isAltitudeIndicate(isAltitudeIndicate: boolean) { this.terrain.isAltitudeIndicate = isAltitudeIndicate; }

  get isWallExist(): boolean {
    return this.hasWall && this.wallImage && this.wallImage.url && this.wallImage.url.length > 0;
  }

  slopeDirectionState = SlopeDirection;

  get isSurfaceShading(): boolean { return this.terrain.isSurfaceShading; }
  set isSurfaceShading(isSurfaceShading: boolean) { this.terrain.isSurfaceShading = isSurfaceShading; }

  get isSlope(): boolean { return this.terrain.isSlope; }
  set isSlope(isSlope: boolean) {
    this.terrain.isSlope = isSlope;
    if (!isSlope) this.terrain.slopeDirection = SlopeDirection.NONE;
  }

  get slopeDirection(): number {
    if (!this.terrain.isSlope) return SlopeDirection.NONE;
    if (this.terrain.isSlope && this.terrain.slopeDirection === SlopeDirection.NONE) return SlopeDirection.BOTTOM;
    return this.terrain.slopeDirection;
  }
  set slopeDirection(slopeDirection: number) {
    this.terrain.isSlope = (slopeDirection != SlopeDirection.NONE);
    this.terrain.slopeDirection = slopeDirection;
  }

  // ↓ terreinAltitude は傾斜を考慮するように書き換えます
  get terreinAltitude(): number {
    let ret = this.altitude;
    if (this.altitude < 0 || (!this.isSlope && !this.isWallExist)) ret += this.height;
    return ret;
  }
  

  // ↓ CSSの変形と陰影を計算する処理を丸ごと追加します
  get floorModCss() {
    let ret = '';
    let tmp = 0;
    switch (this.slopeDirection) {
      case SlopeDirection.TOP:
        tmp = Math.atan(this.height / this.depth);
        ret = ' rotateX(' + tmp + 'rad) scaleY(' + (1 / Math.cos(tmp)) + ')'; break;
      case SlopeDirection.BOTTOM:
        tmp = Math.atan(this.height / this.depth);
        ret = ' rotateX(' + -tmp + 'rad) scaleY(' + (1 / Math.cos(tmp)) + ')'; break;
      case SlopeDirection.LEFT:
        tmp = Math.atan(this.height / this.width);
        ret = ' rotateY(' + -tmp + 'rad) scaleX(' + (1 / Math.cos(tmp)) + ')'; break;
      case SlopeDirection.RIGHT:
        tmp = Math.atan(this.height / this.width);
        ret = ' rotateY(' + tmp + 'rad) scaleX(' + (1 / Math.cos(tmp)) + ')'; break;
    }
    return ret;
  }

  get floorBrightness() {
    let ret = 1.0;
    if (!this.isSurfaceShading) return ret;
    switch (this.slopeDirection) {
      case SlopeDirection.TOP: ret = 0.4; break;
      case SlopeDirection.BOTTOM: ret = 1.0; break;
      case SlopeDirection.LEFT: ret = 0.6; break;
      case SlopeDirection.RIGHT: ret = 0.9; break;
    }
    return ret;
  }



  viewRotateZ = 10;
  math = Math;
  get isDragging(): boolean { return this.pointerDeviceService.isDragging; }
  // === ↑ ここまで追加 ↑ ===

  movableOption: MovableOption = {};
  rotableOption: RotableOption = {};

  private input: InputHandler = null;

  constructor(
    private ngZone: NgZone,
    private imageService: ImageService,
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
      .on(`UPDATE_GAME_OBJECT/identifier/${this.terrain?.identifier}`, event => {
        this.changeDetector.markForCheck();
      })
      .on(`UPDATE_OBJECT_CHILDREN/identifier/${this.terrain?.identifier}`, event => {
        this.changeDetector.markForCheck();
      })
      .on('SYNCHRONIZE_FILE_LIST', event => {
        this.changeDetector.markForCheck();
      })
      .on('UPDATE_FILE_RESOURE', event => {
        this.changeDetector.markForCheck();
      })

      .on<object>('TABLE_VIEW_ROTATE', -1000, event => {
        this.ngZone.run(() => {
          this.viewRotateZ = event.data['z'];
          this.changeDetector.markForCheck();
        });
      })

      .on(`UPDATE_SELECTION/identifier/${this.terrain?.identifier}`, event => {
        this.changeDetector.markForCheck();
        // ↓ 選択状態が変わったのでグリッドを再計算
        setTimeout(() => this.setGameTableGrid(), 0);
      })
      .on('UPDATE_GAME_OBJECT', event => {
        let currentTable = ObjectStore.instance.getObjects(GameTable)[0];
        let tableSelecter = TableSelecter.instance;
        // aliasNameではなく、確実なidentifier（固有ID）で判定する
        if (event.data.identifier === currentTable?.identifier || 
            event.data.identifier === tableSelecter?.identifier || 
            event.data.identifier === this.terrain?.identifier) {
          this.changeDetector.markForCheck();
          setTimeout(() => this.setGameTableGrid(), 0);
        }
      });
    this.movableOption = {
      tabletopObject: this.terrain,
      colideLayers: ['terrain']
    };
    this.rotableOption = {
      tabletopObject: this.terrain
    };
  }

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => {
      this.input = new InputHandler(this.elementRef.nativeElement);
    });
    this.input.onStart = this.onInputStart.bind(this);
    setTimeout(() => this.setGameTableGrid(), 0);
  }

  ngOnDestroy() {
    this.input.destroy();
    EventSystem.unregister(this);
  }

  @HostListener('dragstart', ['$event'])
  onDragstart(e) {
    e.stopPropagation();
    e.preventDefault();
  }

  onInputStart(e: any) {
    this.input.cancel();

    // TODO:もっと良い方法考える
    if (this.isLocked) {
      EventSystem.trigger('DRAG_LOCKED_OBJECT', { srcEvent: e });
    }
  }

  @HostListener('contextmenu', ['$event'])
  onContextMenu(e: Event) {
    e.stopPropagation();
    e.preventDefault();

    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

    let menuPosition = this.pointerDeviceService.pointers[0];
    let menuActions: ContextMenuAction[] = [];
    menuActions = menuActions.concat(this.makeSelectionContextMenu());
    menuActions = menuActions.concat(this.makeContextMenu());

    this.contextMenuService.open(menuPosition, menuActions, this.name);
  }

  onMove() {
    this.contextMenuService.close();
    SoundEffect.play(PresetSound.blockPick);
  }

  onMoved() {
    SoundEffect.play(PresetSound.blockPut);
  }

  private makeSelectionContextMenu(): ContextMenuAction[] {
    if (this.selectionService.objects.length < 1) return [];

    let actions: ContextMenuAction[] = [];

    let objectPosition = this.coordinateService.calcTabletopLocalCoordinate();
    actions.push({ name: 'ここに集める', action: () => this.selectionService.congregate(objectPosition) });

    if (this.isSelected) {
      let selectedGameTableMasks = () => this.selectionService.objects.filter(object => object.aliasName === this.terrain.aliasName) as Terrain[];
      actions.push(
        {
          name: '選択した地形', action: null, subActions: [
            {
              name: 'すべて固定する', action: () => {
                selectedGameTableMasks().forEach(terrain => terrain.isLocked = true);
                SoundEffect.play(PresetSound.lock);
              }
            },
            {
              name: 'すべてのコピーを作る', action: () => {
                selectedGameTableMasks().forEach(terrain => {
                  let cloneObject = terrain.clone();
                  cloneObject.location.x += this.gridSize;
                  cloneObject.location.y += this.gridSize;
                  cloneObject.isLocked = false;
                  if (terrain.parent) terrain.parent.appendChild(cloneObject);
                });
                SoundEffect.play(PresetSound.blockPut);
              }
            }
          ]
        }
      );
    }
    actions.push(ContextMenuSeparator);
    return actions;
  }

  private makeContextMenu(): ContextMenuAction[] {
    let objectPosition = this.coordinateService.calcTabletopLocalCoordinate();
    let actions: ContextMenuAction[] = [];

        actions.push({
      name: '高度設定', action: null, subActions: [
        {
          name: '高度を0にする', action: () => {
            if (this.altitude != 0) {
              this.altitude = 0;
              SoundEffect.play(PresetSound.sweep);
            }
          },
          altitudeHande: this.terrain
        },
        (this.isAltitudeIndicate
          ? { name: '☑ 高度の表示', action: () => { this.isAltitudeIndicate = false; SoundEffect.play(PresetSound.sweep); } }
          : { name: '☐ 高度の表示', action: () => { this.isAltitudeIndicate = true; SoundEffect.play(PresetSound.sweep); } }
        ),
        (this.isDropShadow
          ? { name: '☑ 影の表示', action: () => { this.isDropShadow = false; SoundEffect.play(PresetSound.sweep); } }
          : { name: '☐ 影の表示', action: () => { this.isDropShadow = true; SoundEffect.play(PresetSound.sweep); } }
        )
      ]
    });
    actions.push(ContextMenuSeparator);
    actions.push((this.isLocked
      ? {
        name: '固定解除', action: () => {
          this.isLocked = false;
          SoundEffect.play(PresetSound.unlock);
        }
      } : {
        name: '固定する', action: () => {
          this.isLocked = true;
          SoundEffect.play(PresetSound.lock);
        }
      }));

    actions.push(ContextMenuSeparator);
// === 傾斜メニュー ===
    actions.push({ name: '傾斜', action: null, subActions: [
      { name: `${ this.slopeDirection == SlopeDirection.NONE ? '◉' : '○' } なし`, action: () => { this.slopeDirection = SlopeDirection.NONE; } },
      ContextMenuSeparator,
      { name: `${ this.slopeDirection == SlopeDirection.TOP ? '◉' : '○' } 上（北）`, action: () => { this.slopeDirection = SlopeDirection.TOP; } },
      { name: `${ this.slopeDirection == SlopeDirection.BOTTOM ? '◉' : '○' } 下（南）`, action: () => { this.slopeDirection = SlopeDirection.BOTTOM; } },
      { name: `${ this.slopeDirection == SlopeDirection.LEFT ? '◉' : '○' } 左（西）`, action: () => { this.slopeDirection = SlopeDirection.LEFT; } },
      { name: `${ this.slopeDirection == SlopeDirection.RIGHT ? '◉' : '○' } 右（東）`, action: () => { this.slopeDirection = SlopeDirection.RIGHT; } }
    ]});

    actions.push((this.hasWall
      ? {
        name: '壁を非表示', action: () => {
          this.mode = TerrainViewState.FLOOR;
          if (this.depth * this.width === 0) {
            this.terrain.width = this.width <= 0 ? 1 : this.width;
            this.terrain.depth = this.depth <= 0 ? 1 : this.depth;
          }
        }
      } : {
        name: '壁を表示', action: () => {
          this.mode = TerrainViewState.ALL;
        }
      }));

              actions.push(this.isDropShadow
          ? { name: '影を非表示', action: () => { this.isDropShadow = false; SoundEffect.play(PresetSound.sweep); } }
          : { name: '影を表示', action: () => { this.isDropShadow = true; SoundEffect.play(PresetSound.sweep); } }
        )

      // === 壁の陰影切り替え ===
    actions.push((this.isSurfaceShading
      ? { name: '壁に陰影を付けない', action: () => { this.isSurfaceShading = false; SoundEffect.play(PresetSound.sweep); } }
      : { name: '壁に陰影を付ける', action: () => { this.isSurfaceShading = true; SoundEffect.play(PresetSound.sweep); } }
    ));

    // === ↓ これを追加 ↓ ===
        actions.push(this.isGrid
          ? {
            name: '☑ 床にグリッドを表示', action: () => {
              this.isGrid = false;
              this.setGameTableGrid();
              SoundEffect.play(PresetSound.sweep);
            }
          } : {
            name: '☐ 床にグリッドを表示', action: () => {
              this.isGrid = true;
              this.setGameTableGrid();
              SoundEffect.play(PresetSound.sweep);
            }
          });
        // ======================

    if (!this.isLocked) {
      actions.push(ContextMenuSeparator);
      actions.push({
        name: '重なり順を一番上に', action: () => {
          let parent = this.terrain.parent;
          if (parent) parent.appendChild(this.terrain);
        }
      });
      actions.push({
        name: '重なり順を一番下に', action: () => {
          let parent = this.terrain.parent;
          if (parent) parent.prependChild(this.terrain);
        }
      });
    }
    actions.push(ContextMenuSeparator);
    actions.push({ name: '地形設定を編集', action: () => { this.showDetail(this.terrain); } });
    actions.push({
      name: 'コピーを作る', action: () => {
        let cloneObject = this.terrain.clone();
        cloneObject.location.x += this.gridSize;
        cloneObject.location.y += this.gridSize;
        cloneObject.isLocked = false;
        if (this.terrain.parent) this.terrain.parent.appendChild(cloneObject);
        SoundEffect.play(PresetSound.blockPut);
      }
    });
    actions.push({
      name: '削除する', action: () => {
        this.terrain.destroy();
        SoundEffect.play(PresetSound.sweep);
      }
    });
    // === ↓ ここから追加（高度メニュー） ↓ ===

    // === ↑ ここまで追加 ↑ ===
    actions.push(ContextMenuSeparator);
    actions.push({ name: 'オブジェクト作成', action: null, subActions: this.tabletopActionService.makeDefaultContextMenuActions(objectPosition) });
    return actions;
  }

  private showDetail(gameObject: Terrain) {
    EventSystem.trigger('SELECT_TABLETOP_OBJECT', { identifier: gameObject.identifier, className: gameObject.aliasName });
    let coordinate = this.pointerDeviceService.pointers[0];
    let title = '地形設定';
    if (gameObject.name.length) title += ' - ' + gameObject.name;
    let option: PanelOption = { title: title, left: coordinate.x - 250, top: coordinate.y - 150, width: 500, height: 300 };
    let component = this.panelService.open<GameCharacterSheetComponent>(GameCharacterSheetComponent, option);
    component.tabletopObject = gameObject;
  }
private setGameTableGrid() {
    if (!this.gridCanvas) return;
    
    let gameTables = ObjectStore.instance.getObjects(GameTable);
    if (!gameTables || gameTables.length === 0) return;
    let currentTable = gameTables[0];
    let tableSelecter = TableSelecter.instance;
    
    let render = new GridLineRender(this.gridCanvas.nativeElement);
    let leftPx = this.terrain.location.x - (this.width * this.gridSize / 2);
    let topPx = this.terrain.location.y - (this.depth * this.gridSize / 2);
    
    render.render(this.width, this.depth, this.gridSize, currentTable.gridType, currentTable.gridColor, true, topPx, leftPx);
    
    let opacity = 0.0;
    if (this.isGrid) {
      // 「グリッドを常に表示」がONか、選択中か、マウスでクリック中なら表示！
      if (tableSelecter.gridShow || this.isSelected || this._isPointerDown) {
        opacity = 1.0;
      }
    }
    this.gridCanvas.nativeElement.style.opacity = opacity.toString();
  }
}
