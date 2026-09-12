import {useEffect, useState, type RefObject} from "react";

interface Point { x: number; y: number; }
export function ConnectionLines({canvas, ids, hypothesis, source, compatible}: {
  canvas: RefObject<HTMLDivElement | null>; ids: readonly string[];
  hypothesis: string | null; source: string | undefined;
  compatible: readonly string[] | undefined;
}) {
  const [points, setPoints] = useState<{starts: Point[]; end: Point} | null>(null);
  const identity = ids.join('|');
  // The containing element's ref is attached after child layout effects.
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const measure = () => {
      const target = element.querySelector('.target-proof');
      if (!target) return;
      const bounds = element.getBoundingClientRect();
      const end = target.getBoundingClientRect();
      setPoints({starts: Array.from(element.querySelectorAll('.issuance')).map(item => {
        const box = item.getBoundingClientRect();
        return {x: box.left + box.width / 2 - bounds.left, y: box.bottom - bounds.top};
      }), end: {x: end.left + end.width / 2 - bounds.left, y: end.top - bounds.top}});
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [canvas, identity]);
  const path = (index: number) => {
    const start = points?.starts[index];
    if (!start || !points) return '';
    const bend = start.y + (points.end.y - start.y) * 0.65;
    return `M ${start.x} ${start.y} C ${start.x} ${bend} ${points.end.x} ${bend} ${points.end.x} ${points.end.y}`;
  };
  return <svg className="connection" aria-hidden="true">
    <defs><pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.7" fill="#42453f" /></pattern></defs>
    <rect width="100%" height="100%" fill="url(#grid)" />
    {compatible?.map(id => <path key={id} className="compatible-line" d={path(ids.indexOf(id))} />)}
    {hypothesis && <path className="hypothesis-line" d={path(ids.indexOf(hypothesis))} />}
    {source && <path className="truth-line" d={path(ids.indexOf(source))} />}
  </svg>;
}
