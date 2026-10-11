import type { ChannelSpec, VisualizationWarning } from '../types/index.js';
import { warning } from './warnings.js';

export function orderedAxisWarnings(channel?: ChannelSpec): VisualizationWarning[] {
  return channel?.field && channel.type === 'nominal' ? [warning('connection.unordered-axis',
    'Connecting nominal categories implies an order or continuity that is not declared.',
    'Use bars or points; declare ordinal only when the categories have a meaningful order.',
    { type: 'nominal' }, channel.field)] : [];
}
