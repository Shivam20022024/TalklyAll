import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
}

const Card: React.FC<CardProps> = ({ children, className = '', hoverEffect = false }) => {
  return (
    <div
      className={`rounded-xl border border-ds-line bg-ds-bg ${hoverEffect ? 'transition-colors hover:border-ds-line-strong' : ''} ${className}`}
    >
      {children}
    </div>
  );
};

export default Card;
