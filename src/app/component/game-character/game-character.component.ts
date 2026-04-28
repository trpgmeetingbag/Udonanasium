import { animate, keyframes, style, transition, trigger } from '@angular/animations';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  Input,
  OnChanges,
  OnDestroy
} from '@angular/core';
import { ImageFile } from '@udonarium/core/file-storage/image-file';
import { ImageStorage } from '@udonarium/core/file-storage/image-storage';
import { DataElement } from '@udonarium/data-element';
import { EventSystem, Network } from '@udonarium/core/system';
import { MathUtil } from '@udonarium/core/system/util/math-util';
import { GameCharacter } from '@udonarium/game-character';
import { PresetSound, SoundEffect } from '@udonarium/sound-effect';
import { ChatPaletteComponent } from 'component/chat-palette/chat-palette.component';
import { GameCharacterSheetComponent } from 'component/game-character-sheet/game-character-sheet.component';
import { MovableOption } from 'directive/movable.directive';
import { RotableOption } from 'directive/rotable.directive';
import { ContextMenuAction, ContextMenuSeparator, ContextMenuService } from 'service/context-menu.service';
import { PanelOption, PanelService } from 'service/panel.service';
import { PointerDeviceService } from 'service/pointer-device.service';
import { SelectionState, TabletopSelectionService } from 'service/tabletop-selection.service';
import { InputHandler } from 'directive/input-handler';
import { ElementRef, NgZone /* 他の既存のもの... */ } from '@angular/core';

@Component({
  selector: 'game-character',
  templateUrl: './game-character.component.html',
  styleUrls: ['./game-character.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('bounceInOut', [
      transition('void => *', [
        animate('600ms ease', keyframes([
          style({ transform: 'scale3d(0, 0, 0)', offset: 0 }),
          style({ transform: 'scale3d(1.5, 1.5, 1.5)', offset: 0.5 }),
          style({ transform: 'scale3d(0.75, 0.75, 0.75)', offset: 0.75 }),
          style({ transform: 'scale3d(1.125, 1.125, 1.125)', offset: 0.875 }),
          style({ transform: 'scale3d(1.0, 1.0, 1.0)', offset: 1.0 })
        ]))
      ]),
      transition('* => void', [
        animate(100, style({ transform: 'scale3d(0, 0, 0)' }))
      ])
    ])
  ]
})
export class GameCharacterComponent implements OnChanges, OnDestroy {
  @Input() gameCharacter: GameCharacter | null = null;
  @Input() is3D: boolean = false;

  private input: InputHandler = null;


  // === ↓ ここから追加（エラー解消のためのGetter/Setter） ↓ ===
  get isAltitudeIndicate(): boolean { return this.gameCharacter.isAltitudeIndicate; }
  set isAltitudeIndicate(isAltitudeIndicate: boolean) { this.gameCharacter.isAltitudeIndicate = isAltitudeIndicate; }

  get isDropShadow(): boolean { return this.gameCharacter.isDropShadow; }
  set isDropShadow(isDropShadow: boolean) { this.gameCharacter.isDropShadow = isDropShadow; }

  get isLock(): boolean { return this.gameCharacter.isLock; }
  set isLock(isLock: boolean) { this.gameCharacter.isLock = isLock; }

  get specifyKomaImageFlag(): boolean { return this.gameCharacter.specifyKomaImageFlag; }
  get komaImageHeignt(): number { return this.gameCharacter.komaImageHeignt; }
  
  // === ↑ ここまで追加 ↑ ===

  get name(): string { return this.gameCharacter.name; }
  get size(): number { return MathUtil.clampMin(this.gameCharacter.size); }

  // ▼▼▼ 追加：発言しないフラグの取得 ▼▼▼
  get disableChat(): boolean {
    if (!this.gameCharacter) return false;
    return this.gameCharacter.getAttribute('nonTalkFlag') === 'true';
  }
  // ▲▲▲ 追加ここまで ▲▲▲
  
  // --- START: テーブルインベントリ非表示フラグの取得（リリィ互換版） ---
  get hideInTableInventory(): boolean {
    if (!this.gameCharacter) return false;
    const val = this.gameCharacter.getAttribute('hideInventory');
    return val === 'true';
  }
  // --- END ---
  // get hideInTableInventory(): boolean {
  //   if (!this.gameCharacter || !this.gameCharacter.detailDataElement) return false;
  //   let root = this.gameCharacter.detailDataElement.getFirstElementByName('システム設定');
  //   if (!root) return false;
  //   let el = root.getFirstElementByName('hideInTableInventory');
  //   return el ? el.value === 'true' : false;
  // }
  // --- END ---

// --- START: 盤面のコマ画像を動的に切り替えるロジック ---
get imageFile(): ImageFile {
    if (this.gameCharacter && this.gameCharacter.detailDataElement && this.gameCharacter.imageDataElement) {
      // リリィ互換の保存先（コマ画像 -> ICON）から数値を取得
      let komaRoot = this.gameCharacter.detailDataElement.getFirstElementByName('コマ画像');
      if (komaRoot) {
        let indexElement = komaRoot.getFirstElementByName('ICON');

// --- START: 盤面描画時の参照先を現在値に修正 ---
        let iconIndex = 0;
        if (indexElement) {
           iconIndex = indexElement.currentValue !== undefined ? Number(indexElement.currentValue) : Number(indexElement.value);
        }
// --- END ---

        // let iconIndex = indexElement ? Number(indexElement.value) : 0;        
        // 0以外が選ばれている場合、対応する差分画像を優先して表示する
        if (iconIndex > 0) {
          let images = this.gameCharacter.imageDataElement.children.filter(e => (e as DataElement).name === 'imageIdentifier');
          if (images.length > iconIndex) {
            let identifier = (images[iconIndex] as any).value;
            if (identifier) {
              let image = ImageStorage.instance.get(identifier);
              if (image) return image;
            }
          }
        }
      }
    }
    // スライダーが0の場合や画像が見つからない場合は、本来の基本画像を返す
    return this.gameCharacter.imageFile;
  }
// --- END ---
  // get imageFile(): ImageFile { return this.gameCharacter.imageFile; }


  // === ↓ ここから追加 ↓ ===
  // コマの高度情報を取得・設定する窓口
  get altitude(): number { return this.gameCharacter.altitude; }
  set altitude(altitude: number) { this.gameCharacter.altitude = altitude; }

  // カメラの回転角度（インジケーターの描画用）
  viewRotateZ = 10; 
  // === ↑ ここまで追加 ↑ ===
  // === ↓ ここから追加 ↓ ===
  math = Math; // HTML側で Math.abs 等を使うため
  
  // 地形高度(posZ)とキャラクター自身の高度(altitude)を合算した「海抜」
  get elevation(): number {
    return +((this.gameCharacter.posZ + (this.altitude * this.gridSize)) / this.gridSize).toFixed(1);
  }

  // 吹き出し等の位置調整用（今回は初期値0でOKです）
  get chatBubbleAltitude(): number {
    return 0;
  }
  // === ↑ ここまで追加 ↑ ===


  get rotate(): number { return this.gameCharacter.rotate; }
  set rotate(rotate: number) { this.gameCharacter.rotate = rotate; }
  get roll(): number { return this.gameCharacter.roll; }
  set roll(roll: number) { this.gameCharacter.roll = roll; }

  get selectionState(): SelectionState { return this.selectionService.state(this.gameCharacter); }
  get isSelected(): boolean { return this.selectionState !== SelectionState.NONE; }
  get isMagnetic(): boolean { return this.selectionState === SelectionState.MAGNETIC; }

  gridSize: number = 50;

  movableOption: MovableOption = {};
  rotableOption: RotableOption = {};
  rollOption: RotableOption = {};

  constructor(
    private contextMenuService: ContextMenuService,
    private panelService: PanelService,
    private changeDetector: ChangeDetectorRef,
    private selectionService: TabletopSelectionService,
    private pointerDeviceService: PointerDeviceService,
    private ngZone: NgZone,
    private elementRef: ElementRef<HTMLElement>
  ) { }

  ngOnChanges(): void {
    EventSystem.unregister(this);
    EventSystem.register(this)
      .on(`UPDATE_GAME_OBJECT/identifier/${this.gameCharacter?.identifier}`, event => {
        this.changeDetector.markForCheck();
      })
      .on(`UPDATE_OBJECT_CHILDREN/identifier/${this.gameCharacter?.identifier}`, event => {
        this.changeDetector.markForCheck();
      })
      .on('SYNCHRONIZE_FILE_LIST', event => {
        this.changeDetector.markForCheck();
      })
      .on('UPDATE_FILE_RESOURE', event => {
        this.changeDetector.markForCheck();
      })
      .on(`UPDATE_SELECTION/identifier/${this.gameCharacter?.identifier}`, event => {
        this.changeDetector.markForCheck();
      });
    this.movableOption = {
      tabletopObject: this.gameCharacter,
      transformCssOffset: 'translateZ(1.0px)',
      colideLayers: ['terrain']
    };
    this.rotableOption = {
      tabletopObject: this.gameCharacter
    };
    this.rollOption = {
      tabletopObject: this.gameCharacter,
      targetPropertyName: 'roll',
    };
  }

  ngOnDestroy() {
    EventSystem.unregister(this);
  }

  @HostListener('dragstart', ['$event'])
  onDragstart(e: any) {
    console.log('Dragstart Cancel !!!!');
    e.stopPropagation();
    e.preventDefault();
  }

    @HostListener('contextmenu', ['$event'])
  onContextMenu(e: Event) {
    e.stopPropagation();
    e.preventDefault();

    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

    let position = this.pointerDeviceService.pointers[0];
    this.contextMenuService.open(position, [
      { 
        name: '高度設定', action: null, subActions: [
          {
            name: '高度を0にする', action: () => {
              if (this.altitude != 0) {
                this.altitude = 0;
                SoundEffect.play(PresetSound.sweep);
              }
            },
            altitudeHande: this.gameCharacter
          },
          (this.isAltitudeIndicate
            ? {
              name: '☑ 高度の表示', action: () => {
                this.isAltitudeIndicate = false;
                SoundEffect.play(PresetSound.sweep);
                EventSystem.trigger('UPDATE_INVENTORY', null);
              }
            } : {
              name: '☐ 高度の表示', action: () => {
                this.isAltitudeIndicate = true;
                SoundEffect.play(PresetSound.sweep);
                EventSystem.trigger('UPDATE_INVENTORY', null);
              }
            }),
          (this.isDropShadow
            ? {
              name: '☑ 影の表示', action: () => {
                this.isDropShadow = false;
                SoundEffect.play(PresetSound.sweep);
               EventSystem.trigger('UPDATE_INVENTORY', null);
               }
            } : {
              name: '☐ 影の表示', action: () => {
               this.isDropShadow = true;
                SoundEffect.play(PresetSound.sweep);
                EventSystem.trigger('UPDATE_INVENTORY', null);
              },
            })
        ]
      },
      ContextMenuSeparator,
      { name: '詳細を表示', action: () => { this.showDetail(this.gameCharacter); } },
      { name: 'チャットパレットを表示', action: () => { this.showChatPalette(this.gameCharacter) } },
      // { name: 'リモコンを表示', action: () => { this.showRemoteController(this.gameCharacter) } },
      // { name: 'バフ編集', action: () => { this.showBuffEdit(this.gameCharacter) } },
      ContextMenuSeparator,
      {
        name: '共有イベントリに移動', action: () => {
          this.gameCharacter.setLocation('common');
          SoundEffect.play(PresetSound.piecePut);
        }
      },
      {
        name: '個人イベントリに移動', action: () => {
          this.gameCharacter.setLocation(Network.peerId);
          SoundEffect.play(PresetSound.piecePut);
        }
      },
      {
        name: '墓場に移動', action: () => {
          this.gameCharacter.setLocation('graveyard');
          SoundEffect.play(PresetSound.sweep);
        }
      },

      ContextMenuSeparator,
      (this.isLock
        ? {
          name: '固定解除', action: () => {
            this.isLock = false;
            SoundEffect.play(PresetSound.unlock);
          }
        } : {
          name: '固定する', action: () => {
            this.isLock = true;
            SoundEffect.play(PresetSound.lock);
          }
        }),
      ContextMenuSeparator,
      {
        name: 'コピーを作る', action: () => {
          let cloneObject = this.gameCharacter.clone();
          cloneObject.location.x += this.gridSize;
          cloneObject.location.y += this.gridSize;
          cloneObject.update();
          SoundEffect.play(PresetSound.piecePut);
        }
      },
    ], this.name);
  }
  // @HostListener('contextmenu', ['$event'])
  // onContextMenu(e: Event) {
  //   e.stopPropagation();
  //   e.preventDefault();

  //   if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

  //   let position = this.pointerDeviceService.pointers[0];

  //   let menuActions: ContextMenuAction[] = [];
  //   menuActions = menuActions.concat(this.makeSelectionContextMenu());
  //   menuActions = menuActions.concat(this.makeContextMenu());
  //   this.contextMenuService.open(position, menuActions, this.name);
  // }

  onMove() {
    this.contextMenuService.close();
    SoundEffect.play(PresetSound.piecePick);
  }

  onMoved() {
    SoundEffect.play(PresetSound.piecePut);
  }

  private makeSelectionContextMenu(): ContextMenuAction[] {
    if (this.selectionService.objects.length < 1) return [];

    let actions: ContextMenuAction[] = [];

    let objectPosition = {
      x: this.gameCharacter.location.x + (this.gameCharacter.size * this.gridSize) / 2,
      y: this.gameCharacter.location.y + (this.gameCharacter.size * this.gridSize) / 2,
      z: this.gameCharacter.posZ
    };
    actions.push({ name: 'ここに集める', action: () => this.selectionService.congregate(objectPosition) });

    if (this.isSelected) {
      let selectedCharacter = () => this.selectionService.objects.filter(object => object.aliasName === this.gameCharacter.aliasName) as GameCharacter[];
      actions.push(
        {
          name: '選択したキャラクター', action: null, subActions: [
            {
              name: 'すべて共有イベントリに移動', action: () => {
                selectedCharacter().forEach(gameCharacter => {
                  gameCharacter.setLocation('common')
                  this.selectionService.remove(gameCharacter);
                });
                SoundEffect.play(PresetSound.piecePut);
              }
            },
            {
              name: 'すべて個人イベントリに移動', action: () => {
                selectedCharacter().forEach(gameCharacter => {
                  gameCharacter.setLocation(Network.peerId);
                  this.selectionService.remove(gameCharacter);
                });
                SoundEffect.play(PresetSound.piecePut);
              }
            },
            {
              name: 'すべて墓場に移動', action: () => {
                selectedCharacter().forEach(gameCharacter => {
                  gameCharacter.setLocation('graveyard');
                  this.selectionService.remove(gameCharacter);
                });
                SoundEffect.play(PresetSound.sweep);
              }
            },
          ]
        }
      );
    }
    actions.push(ContextMenuSeparator);
    return actions;
  }

  private makeContextMenu(): ContextMenuAction[] {
    let actions: ContextMenuAction[] = [];

    actions.push({ name: '詳細を表示', action: () => { this.showDetail(this.gameCharacter); } });
    actions.push({ name: 'チャットパレットを表示', action: () => { this.showChatPalette(this.gameCharacter) } });
    actions.push(ContextMenuSeparator);
    actions.push({
      name: '共有イベントリに移動', action: () => {
        this.gameCharacter.setLocation('common');
        SoundEffect.play(PresetSound.piecePut);
      }
    });
    actions.push({
      name: '個人イベントリに移動', action: () => {
        this.gameCharacter.setLocation(Network.peerId);
        SoundEffect.play(PresetSound.piecePut);
      }
    });
    actions.push({
      name: '墓場に移動', action: () => {
        this.gameCharacter.setLocation('graveyard');
        SoundEffect.play(PresetSound.sweep);
      }
    });
    actions.push(ContextMenuSeparator);
    actions.push({
      name: 'コピーを作る', action: () => {
        let cloneObject = this.gameCharacter.clone();
        cloneObject.location.x += this.gridSize;
        cloneObject.location.y += this.gridSize;
        cloneObject.update();
        SoundEffect.play(PresetSound.piecePut);
      }
    });
    return actions;
  }

  private showDetail(gameObject: GameCharacter) {
    let coordinate = this.pointerDeviceService.pointers[0];
    let title = 'キャラクターシート';
    if (gameObject.name.length) title += ' - ' + gameObject.name;
    let option: PanelOption = { title: title, left: coordinate.x - 400, top: coordinate.y - 300, width: 800, height: 600 };
    let component = this.panelService.open<GameCharacterSheetComponent>(GameCharacterSheetComponent, option);
    component.tabletopObject = gameObject;
  }

  private showChatPalette(gameObject: GameCharacter) {
    let coordinate = this.pointerDeviceService.pointers[0];
    let option: PanelOption = { left: coordinate.x - 250, top: coordinate.y - 175, width: 615, height: 350 };
    let component = this.panelService.open<ChatPaletteComponent>(ChatPaletteComponent, option);
    component.character = gameObject;
  }

  // 入力（クリックやドラッグ）が開始された時の処理
  onInputStart(e: any) {
    // 固定されている場合、操作をキャンセルする
    if (this.isLock) {
      this.input.cancel();
      // システム側に「固定されたオブジェクトをドラッグしようとした」ことを通知
      EventSystem.trigger('DRAG_LOCKED_OBJECT', {});
    }
  }
  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => {
      this.input = new InputHandler(this.elementRef.nativeElement);
    });
    this.input.onStart = this.onInputStart.bind(this); // ← ここで紐付け
  }
}
