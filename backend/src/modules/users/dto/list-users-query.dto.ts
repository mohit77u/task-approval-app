import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ROLE_CODES, RoleCode } from '../../../common/enums/role-code.enum';

export class ListUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(ROLE_CODES)
  roleCode?: RoleCode;
}
