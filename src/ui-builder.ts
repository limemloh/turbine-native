import { View } from "tns-core-modules/ui/core/view";
import { Page } from "tns-core-modules/ui/page";
import { Style } from "tns-core-modules/ui/styling/style";
import { LayoutBase } from "tns-core-modules/ui/layouts/layout-base";
import { TextBase } from "tns-core-modules/ui/text-base";
import { Frame } from "tns-core-modules/ui/frame";
import { Observable, EventData } from "tns-core-modules/data/observable";

import { Component, isComponent } from './component';
import { streamFromObservable, behaviorFromObservable, viewObserve } from "./hareactive-wrapper";
import { isBehavior, Behavior } from "@funkia/hareactive";
import { Showable } from '@funkia/turbine';
import { toComponent } from "./native";

interface UIConstuctor<A> {
  new (): A
}

type Parent = Page | LayoutBase;
interface ChildList extends Array<Child> {}
type Child<A = {}> = ChildList | Component<A, Parent> | Showable | Behavior<Showable>;

type StreamDescription<B> = {
  name: string,
  extractor?: (a: any) => B
};

type BehaviorDescription<B> = {
  name: string,
  initial: B,
  extractor?: (a: any) => B,
};

type Properties = {
  style?: Partial<Style>,
  streams?: Record<string, StreamDescription<any>>,
  behaviors?: Record<string, BehaviorDescription<any>>
}

function isShowable(obj: any): obj is Showable {
  return typeof obj === "string" || typeof obj === "number"; 
}

function isChild(a: any): a is Child {
  return isComponent(a) || isShowable(a) || Array.isArray(a) || isBehavior(a);
}

function isParent(a: any): a is Parent {
  return a instanceof Page || a instanceof LayoutBase;
}

function id<A>(a: A): A {
  return a;
}

class UIViewElement <B, A extends View> extends Component<B, Parent> {
  constructor(
    private viewC: UIConstuctor<A>, 
    private props: Properties,
    private child?: Child<any>
  ) {
    super();
  }
  run(parent: Parent): B {
    const view = new this.viewC();
    
    if ("style" in this.props) {
      Object.keys(this.props.style).forEach(key => {
        view.style.set(key, this.props.style[key]);
      })
    }

    // output
    let output: any = {};
    if ("streams" in this.props) {
      Object.keys(this.props.streams).reduce((out, key) => {
        const {name, extractor = id} = this.props.streams[key];
        out[key] = streamFromObservable(view, name, extractor);
        return out;
      }, output);
    }
    
    if ("behaviors" in this.props) {
      Object.keys(this.props.behaviors).reduce((out, key) => {
        const {name, extractor = id, initial} = this.props.behaviors[key];
        out[key] = behaviorFromObservable(view, name, initial, extractor);
        return out;
      }, output);
    }

    // add child
    if (this.child !== undefined) {
      if (view instanceof TextBase) {
        if (isShowable(this.child)) {
          view.set("text", this.child.toString());
        } else if (isBehavior(this.child)) {
          viewObserve((a) => view.set("text", a.toString()), this.child)
        } else {
          throw "Child should be a Text, Number or a Behavior of them";
        }
      } else if (isParent(view) && isChild(this.child)) {
        const childOut = toComponent(<any>this.child).run(view);
        Object.assign(output, childOut);
      } else {
        throw "Unsupported child";
      }
    }

    // add ourself
    if (parent instanceof Page) {
      parent.content = view;
    } else {
      parent.addChild(view);
    }
    
    return output;
  }
}

export function uiViewElement<A extends View>(viewC: UIConstuctor<A>, defaultProps: Properties = {}) {
  function createUI(propsOrChild?: Properties, child?: Child<A>): Component<any, any> {
    if (child === undefined && isChild(propsOrChild)) {
      return new UIViewElement(viewC, defaultProps, propsOrChild);
    } else {
      return new UIViewElement(viewC, mergeProps(defaultProps, propsOrChild), child);
    }
  }
  return createUI;
}

function mergeProps(a: Properties, b: Properties): Properties {
  // TODO: more intelligent
  return Object.assign({}, a, b);
}
