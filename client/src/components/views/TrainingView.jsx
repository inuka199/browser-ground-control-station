import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import PageHeader from './PageHeader.jsx';

const LESSONS = [
  { id: 'controls', title: '01 · Your first flight', text: 'Hold W to climb and S to descend. A/D rotate left/right. Up flies forward with the nose down; Down flies backward with the nose up. Left/Right move sideways. Release movement keys to hover.', question: 'Which keys rotate the aircraft?', answers: ['A and D', 'W and S', 'Up and Down'], correct: 0, explanation: 'A/D control yaw. Q/E are unassigned.' },
  { id: 'views', title: '02 · Camera awareness', text: 'Use 1–5 to select Chase, FPV, Top, Side or Free. C cycles cameras. In Free view, drag to orbit and scroll to zoom. The FPV camera field of view and tilt are configured on the Gadgets page.', question: 'Which camera shows the onboard view?', answers: ['Top', 'FPV', 'Side'], correct: 1, explanation: 'FPV looks through the drone camera and follows its attitude.' },
  { id: 'live', title: '03 · Offline and live flight', text: 'The keyboard controls the offline demo only. Live commands require a connected bridge and fresh telemetry. Pausing the browser freezes the local scene; an external ArduPilot process continues to run.', question: 'Does pressing Escape stop external SITL?', answers: ['Yes, always', 'Only in FPV', 'No, it only pauses the local simulator'], correct: 2, explanation: 'External SITL runs independently. Manage it in the terminal where it was started.' },
];
const useLessons = create(persist(set => ({ completed: {}, complete: id => set(s => ({ completed: { ...s.completed, [id]: true } })) }), { name: 'nexus-lessons' }));
function Lesson({ lesson }) {
  const [answer, setAnswer] = useState(null), [checked, setChecked] = useState(false);
  const completed = useLessons(s => s.completed[lesson.id]);
  return <article className="workspace-card"><h2>{lesson.title} {completed ? '✓' : ''}</h2><p>{lesson.text}</p><fieldset><legend>{lesson.question}</legend>{lesson.answers.map((text, index) => <label className="workspace-inline-check" key={text}><input type="radio" name={lesson.id} checked={answer === index} onChange={() => { setAnswer(index); setChecked(false); }}/>{text}</label>)}</fieldset><button disabled={answer == null} onClick={() => { setChecked(true); if (answer === lesson.correct) useLessons.getState().complete(lesson.id); }}>Check answer</button>{checked && <p role="status">{answer === lesson.correct ? 'Correct. ' : 'Try again. '}{lesson.explanation}</p>}</article>;
}
export default function TrainingView() {
  const completed = useLessons(s => s.completed), count = LESSONS.filter(lesson => completed[lesson.id]).length;
  return <section className="workspace-page"><PageHeader title="Training & ground school">Learn the controls, check your understanding, then practice in the simulator.</PageHeader><p>{count}/{LESSONS.length} lessons completed</p><progress className="workspace-progress" aria-label="Lesson completion" max={LESSONS.length} value={count}/><div className="workspace-grid">{LESSONS.map(lesson => <Lesson key={lesson.id} lesson={lesson}/>)}</div><div className="workspace-actions"><Link className="workspace-button" to="/challenges">Practice a flight challenge</Link><Link className="workspace-button" to="/simulator">Open simulator</Link></div></section>;
}
