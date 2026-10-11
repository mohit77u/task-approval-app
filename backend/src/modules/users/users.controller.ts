import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Paginated } from '../../common/dto/pagination-query.dto';
import { RoleCode } from '../../common/enums/role-code.enum';
import type { AuthUser } from '../../common/types/request.types';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserSummary } from './user.mapper';
import { UsersService } from './users.service';

const UserIdPipe = new ParseIntPipe({
  errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
});

@ApiTags('users')
@Roles(RoleCode.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() query: ListUsersQueryDto): Promise<Paginated<UserSummary>> {
    return this.users.list(query);
  }

  @Get(':id')
  get(@Param('id', UserIdPipe) id: number): Promise<UserSummary> {
    return this.users.get(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto): Promise<UserSummary> {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', UserIdPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): Promise<UserSummary> {
    return this.users.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() actor: AuthUser,
    @Param('id', UserIdPipe) id: number,
  ): Promise<void> {
    return this.users.remove(actor.id, id);
  }
}
