import React from 'react';
import { CustomerGoal } from '../../../core/types/types';
import { Target, CheckCircle, Clock } from 'lucide-react';

interface GoalProgressProps {
  goal: CustomerGoal;
}

export const GoalProgress: React.FC<GoalProgressProps> = ({ goal }) => {
  const progress = (goal.currentValue / goal.targetValue) * 100;
  const isCompleted = goal.status === 'completed';

  return (
    <div className="group bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-gray-100 dark:border-gray-700 hover:scale-[1.02]">
      <div className="flex items-start justify-between mb-5">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-3">
            <div className={`p-2.5 rounded-xl ${
              isCompleted 
                ? 'bg-gradient-to-br from-green-500 to-green-600' 
                : 'bg-gradient-to-br from-blue-500 to-blue-600'
            }`}>
              {isCompleted ? (
                <CheckCircle className="w-5 h-5 text-white" />
              ) : (
                <Target className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                {goal.title}
              </h3>
              {goal.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {goal.description}
                </p>
              )}
            </div>
          </div>
        </div>
        {goal.rewardPoints > 0 && (
          <div className="text-right bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 px-4 py-2 rounded-xl border border-green-200 dark:border-green-800">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Recompensa</p>
            <p className="font-bold text-green-600 dark:text-green-400 text-lg">{goal.rewardPoints}</p>
            <p className="text-xs text-green-600 dark:text-green-400">pontos</p>
          </div>
        )}
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {goal.currentValue.toLocaleString()} / {goal.targetValue.toLocaleString()}
          </span>
          <span className="font-bold text-lg text-gray-900 dark:text-white">
            {Math.min(progress, 100).toFixed(0)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden shadow-inner">
          <div
            className={`h-full transition-all duration-500 ease-out relative ${
              isCompleted
                ? 'bg-gradient-to-r from-green-500 to-green-600'
                : 'bg-gradient-to-r from-blue-500 to-blue-600'
            }`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          >
            {progress > 10 && (
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            )}
          </div>
        </div>
      </div>

      {goal.deadline && !isCompleted && (
        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 px-3 py-2 rounded-lg">
          <Clock className="w-4 h-4" />
          <span>
            Prazo: {new Date(goal.deadline).toLocaleDateString('pt-MZ', {
              day: '2-digit',
              month: 'long',
              year: 'numeric'
            })}
          </span>
        </div>
      )}
    </div>
  );
};


