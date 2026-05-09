import { SyncObject, SyncVar } from './core/synchronize-object/decorator';
import { DataElement } from './data-element';
import { TabletopObject } from './tabletop-object';
// ▼ 追加：オーナー判定のためのインポート
import { Network } from './core/system';
import { PeerCursor } from './peer-cursor';

@SyncObject('table-mask')
export class GameTableMask extends TabletopObject {
  @SyncVar() isLock: boolean = false;
  @SyncVar() dispLockMark: boolean = true;

  // ▼▼▼ 追加：スクラッチ機能のための同期変数 ▼▼▼
  @SyncVar() owner: string = '';             // 現在スクラッチ操作中のプレイヤーID
  @SyncVar() scratchingGrids: string = '';   // 現在削っている最中の座標データ（未確定）
  @SyncVar() scratchedGrids: string = '';    // 削り終わって確定した座標データ
  @SyncVar() isPreview: boolean = false;     // スクラッチのプレビュー表示状態
  // ▲▲▲ 追加ここまで ▲▲▲

  get name(): string { return this.getCommonValue('name', ''); }
  get width(): number { return this.getCommonValue('width', 1); }
  get height(): number { return this.getCommonValue('height', 1); }
  get opacity(): number {
    let element = this.getElement('opacity', this.commonDataElement);
    let num = element ? <number>element.currentValue / <number>element.value : 1;
    return Number.isNaN(num) ? 1 : num;
  }

  // ▼▼▼ 追加：オーナー（操作者）状態を取得するためのゲッター群 ▼▼▼
  get ownerName(): string {
    let object = PeerCursor.findByUserId(this.owner);
    return object ? object.name : '';
  }

  get hasOwner(): boolean { return 0 < this.owner.length; }
  
// ▼ 修正：Network.peer と Network.peers に変更
  get ownerIsOnline(): boolean {
    if (!this.hasOwner) return false; 
    return (Network.peer.userId === this.owner && Network.peer.isOpen)
      || Network.peers.some(peer => {
        const cursor = PeerCursor.findByPeerId(peer.peerId);
        return cursor && cursor.userId === this.owner && peer.isOpen;
      }); 
  }

  // ▼ 修正：Network.peer に変更
  get isMine(): boolean { return Network.peer.userId === this.owner; }
  // ▲▲▲ 追加ここまで ▲▲▲

  static create(name: string, width: number, height: number, opacity: number, identifier?: string): GameTableMask {
    let object: GameTableMask = null;

    if (identifier) {
      object = new GameTableMask(identifier);
    } else {
      object = new GameTableMask();
    }
    object.createDataElements();

    object.commonDataElement.appendChild(DataElement.create('name', name, {}, 'name_' + object.identifier));
    object.commonDataElement.appendChild(DataElement.create('width', width, {}, 'width_' + object.identifier));
    object.commonDataElement.appendChild(DataElement.create('height', height, {}, 'height_' + object.identifier));
    object.commonDataElement.appendChild(DataElement.create('opacity', opacity, { type: 'numberResource', currentValue: opacity }, 'opacity_' + object.identifier));
    object.initialize();

    return object;
  }
}