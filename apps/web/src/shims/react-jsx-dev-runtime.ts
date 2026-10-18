import React from 'react';

export const Fragment = React.Fragment || Symbol.for('react.fragment');
const REACT_ELEMENT_TYPE = Symbol.for('react.transitional.element');

export function jsxDEV(type: any, props: any, key: any) {
  let resolvedKey = null;
  if (key !== undefined) {
    resolvedKey = '' + key;
  } else if (props && props.key !== undefined) {
    resolvedKey = '' + props.key;
  }

  const finalProps: Record<string, any> = {};
  if (props) {
    for (const propName in props) {
      if (propName !== 'key') {
        finalProps[propName] = props[propName];
      }
    }
  }

  return {
    $$typeof: REACT_ELEMENT_TYPE,
    type,
    key: resolvedKey,
    ref: props?.ref !== undefined ? props.ref : null,
    props: finalProps,
    _owner: null,
    _store: {},
  };
}

export default {
  Fragment,
  jsxDEV,
};
