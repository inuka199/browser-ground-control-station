import {expect,it,vi} from 'vitest';
import {bindControls} from '../../public/tideline/controls.js';
it('accepts both thumbs independently, handles cancellation and clears input on pause',()=>{
  const pad=document.createElement('div'), action=document.createElement('button');
  pad.getBoundingClientRect=()=>({left:0,top:0,width:100,height:100});
  pad.setPointerCapture=action.setPointerCapture=vi.fn();
  const control=bindControls(pad,action,vi.fn(),()=>true);
  function send(to,event,id,x=50,y=50) {
    const e=new Event(event,{cancelable:true});
    Object.assign(e,{pointerId:id,clientX:x,clientY:y,button:0});to.dispatchEvent(e);
  }
  send(pad,'pointerdown',1,100,50);send(action,'pointerdown',2);
  expect(control.read()).toEqual({x:1,y:0,scan:true});
  send(pad,'pointermove',3,0,0);expect(control.read().x).toBe(1);
  send(pad,'pointercancel',1);expect(control.read()).toEqual({x:0,y:0,scan:true});
  send(action,'lostpointercapture',2);expect(control.read().scan).toBe(false);
  window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));
  expect(control.read().y).toBe(-1);
  control.clear();expect(control.read()).toEqual({x:0,y:0,scan:false});
});
