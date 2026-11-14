import React from 'react';
import { Text } from 'react-native';
const make = (name) => (props) => React.createElement(Text, null, '[' + (props && props.name ? props.name : name) + ']');
export const Ionicons = make('Ionicons');
export default { Ionicons };
