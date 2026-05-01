import { ChatTab } from './chat-tab';
import { SyncObject, SyncVar } from './core/synchronize-object/decorator';
import { ObjectNode } from './core/synchronize-object/object-node';
import { InnerXml } from './core/synchronize-object/object-serializer';
import { Network } from './core/system';

@SyncObject('chat-tab-list')
export class ChatTabList extends ObjectNode implements InnerXml {

  // ーーーここから追加（リリィ互換の立ち絵全体設定）ーーー
  @SyncVar() tachieHeightValue: number = 200;
  
  
  minTachieSize: number = 100;
  maxTachieSize: number = 1000;
  isTachieInWindow: boolean = true;
  // ーーー追加ここまでーーー
  
  private static _instance: ChatTabList;
  static get instance(): ChatTabList {
    if (!ChatTabList._instance) {
      ChatTabList._instance = new ChatTabList('ChatTabList');
      ChatTabList._instance.initialize();
    }
    return ChatTabList._instance;
  }

  get chatTabs(): ChatTab[] { return this.children as ChatTab[]; }

  addChatTab(chatTab: ChatTab): ChatTab
  addChatTab(tabName: string, identifier?: string): ChatTab
  addChatTab(...args: any[]): ChatTab {
    let chatTab: ChatTab = null;
    if (args[0] instanceof ChatTab) {
      chatTab = args[0];
    } else {
      let tabName: string = args[0];
      let identifier: string = args[1];
      chatTab = new ChatTab(identifier);
      chatTab.name = tabName;
      chatTab.initialize();
    }
    return this.appendChild(chatTab);
  }

  parseInnerXml(element: Element) {
    // XMLからの新規作成を許可せず、既存のオブジェクトを更新する
    for (let child of ChatTabList.instance.children) {
      child.destroy();
    }

    let context = ChatTabList.instance.toContext();
    context.syncData = this.toContext().syncData;
    ChatTabList.instance.apply(context);
    ChatTabList.instance.update();

    super.parseInnerXml.apply(ChatTabList.instance, [element]);
    this.destroy();
  }
  // === ↓ ここから追加（全タブログ出力用メソッド） ↓ ===
  logHtml(): string {
    let head = "<?xml version='1.0' encoding='UTF-8'?>\n<!DOCTYPE html PUBLIC '-//W3C//DTD XHTML 1.0 Transitional//EN' 'http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd'>\n<html xmlns='http://www.w3.org/1999/xhtml' lang='ja'>\n  <head>\n    <meta http-equiv='Content-Type' content='text/html; charset=UTF-8' />\n    <title>チャットログ：全タブ</title>\n  </head>\n  <body>\n";
    let last = "\n  </body>\n</html>";
    let main = "";
    
    if( this.chatTabs ){
      let tabNum = this.chatTabs.length;
      let indexList: number[] = new Array(tabNum).fill(0);
      let fastTabIndex: number = null;
      let chkTimestamp: number = null;

      while( 1 ){
        fastTabIndex = -1;
        chkTimestamp = -1;

        for( let i = 0 ; i < tabNum ; i++){
          if( this.chatTabs[i].chatMessages.length <= indexList[i] ) continue;
          if( chkTimestamp == -1 || chkTimestamp > this.chatTabs[i].chatMessages[indexList[i]].timestamp ){
            chkTimestamp = this.chatTabs[i].chatMessages[indexList[i]].timestamp;
            fastTabIndex = i;
          }
        }
        if( fastTabIndex == -1) break;
        
        let to = this.chatTabs[ fastTabIndex ].chatMessages[ indexList[fastTabIndex] ].to;
        let from = this.chatTabs[ fastTabIndex ].chatMessages[ indexList[fastTabIndex] ].from;
        let myId = Network.peer.userId; // 修正済
        if( to && ( to != myId) && ( from != myId) ){
          indexList[ fastTabIndex ] ++;
          continue;
        }
        
        // 修正済: simpleDispFlagTimeが存在しないため、true固定（常に時間表示）
        main += this.chatTabs[ fastTabIndex ].messageHtml( true , this.chatTabs[ fastTabIndex ].name , this.chatTabs[ fastTabIndex ].chatMessages[ indexList[fastTabIndex] ] );
        indexList[ fastTabIndex ] ++;
      }
    }
    return head + main + last;
  }

  logHtmlCoc(): string {
    let head = "<!DOCTYPE html>\n<html lang=\"ja\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <meta http-equiv=\"X-UA-Compatible\" content=\"ie=edge\" />\n    <title>udonaliumlily - logs</title>\n  </head>\n  <body>\n   \n";
    let last = "\n  </body>\n</html>";
    let main = "";
    
    if( this.chatTabs ){
      let tabNum = this.chatTabs.length;
      let indexList: number[] = new Array(tabNum).fill(0);
      let fastTabIndex: number = null;
      let chkTimestamp: number = null;

      while( 1 ){
        fastTabIndex = -1;
        chkTimestamp = -1;

        for( let i = 0 ; i < tabNum ; i++){
          if( this.chatTabs[i].chatMessages.length <= indexList[i] ) continue;
          if( chkTimestamp == -1 || chkTimestamp > this.chatTabs[i].chatMessages[indexList[i]].timestamp ){
            chkTimestamp = this.chatTabs[i].chatMessages[indexList[i]].timestamp;
            fastTabIndex = i;
          }
        }
        if( fastTabIndex == -1) break;
        
        let to = this.chatTabs[ fastTabIndex ].chatMessages[ indexList[fastTabIndex] ].to;
        let from = this.chatTabs[ fastTabIndex ].chatMessages[ indexList[fastTabIndex] ].from;
        let myId = Network.peer.userId; // 修正済
        if( to && ( to != myId) && ( from != myId) ){
          indexList[ fastTabIndex ] ++;
          continue;
        }
        
        main += this.chatTabs[ fastTabIndex ].messageHtmlCoc( this.chatTabs[ fastTabIndex ].name , this.chatTabs[ fastTabIndex ].chatMessages[ indexList[fastTabIndex] ] );
        indexList[ fastTabIndex ] ++;
      }
    }
    return head + main + last;
  }
  // === ↑ ここまで追加 ↑ ===
}
