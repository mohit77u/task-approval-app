import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RoleCode } from '../../../common/enums/role-code.enum';
import { UsersService } from '../services/users.service';

@ApiTags('roles')
@Roles(RoleCode.ADMIN)
@Controller('roles')
export class RolesController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(): Promise<Array<{ id: number; code: string; name: string }>> {
    const roles = await this.users.listRoles();
    return roles.map(({ id, code, name }) => ({ id, code, name }));
  }
}
