import React from 'react';
import type { Role, Performer } from '../types';
import { Users, UserCog, Shield, ChevronDown } from 'lucide-react';

interface RoleSwitcherProps {
  currentRole: Role;
  onRoleChange: (role: Role) => void;
  performers: Performer[];
  currentPerformerId: number | null;
  onPerformerChange: (id: number | null) => void;
}

const SelectWrapper: React.FC<{children: React.ReactNode}> = ({ children }) => (
    <div className="relative">
        {children}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-zinc-400">
          <ChevronDown className="h-4 w-4" />
        </div>
    </div>
);


const RoleSwitcher: React.FC<RoleSwitcherProps> = ({ currentRole, onRoleChange, performers, currentPerformerId, onPerformerChange }) => {
  const roles: { id: Role, name: string, icon: React.ReactNode }[] = [
    { id: 'user', name: 'Client View', icon: <Users className="h-4 w-4 mr-2" /> },
    { id: 'performer', name: 'Performer View', icon: <UserCog className="h-4 w-4 mr-2" /> },
    { id: 'admin', name: 'Admin View', icon: <Shield className="h-4 w-4 mr-2" /> },
  ];
  
  const selectClass = "bg-zinc-800 border border-zinc-700 text-white text-sm rounded-md focus:ring-orange-500 focus:border-orange-500 block w-full pl-3 pr-10 py-2 appearance-none transition-colors hover:bg-zinc-700";

  return (
    <div className="flex items-center gap-2">
      <SelectWrapper>
        <select 
          value={currentRole}
          onChange={(e) => onRoleChange(e.target.value as Role)}
          className={selectClass}
        >
          {roles.map(role => (
            <option key={role.id} value={role.id}>{role.name}</option>
          ))}
        </select>
      </SelectWrapper>
      
      {currentRole === 'performer' && (
        <SelectWrapper>
            <select 
              value={currentPerformerId ?? ''}
              onChange={(e) => onPerformerChange(Number(e.target.value))}
              className={selectClass}
            >
              <option value="" disabled>Select Performer</option>
              {performers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
        </SelectWrapper>
      )}
    </div>
  );
};

export default RoleSwitcher;